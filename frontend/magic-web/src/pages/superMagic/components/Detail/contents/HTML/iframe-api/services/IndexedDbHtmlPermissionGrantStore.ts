import { htmlMicroAppPreviewLogger } from "../../utils/htmlMicroAppPreviewLogger"
import type { HtmlPermissionScope } from "../types"
import {
	createHtmlPermissionAppKey,
	isHtmlPermissionGrantActive,
	LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY,
	MAX_HTML_PERMISSION_GRANTS,
	type HtmlPermissionGrant,
	type HtmlPermissionGrantIdentity,
	type HtmlPermissionGrantStore,
} from "./HtmlPermissionGrantStore"
import {
	EPOCH_META_KEY,
	GRANTS_STORE_NAME,
	HTML_PERMISSION_DB_NAME,
	HTML_PERMISSION_DB_VERSION,
	META_STORE_NAME,
	REVISION_META_KEY,
	REVOCATION_META_PREFIX,
	getRequestResult,
	getStoredEpoch,
	getStoredRevision,
	getStoredRevocation,
	getTransactionError,
	grantRecordKey,
	isValidStoredGrant,
	revocationMetaKey,
	type HtmlPermissionGrantState,
	type HtmlPermissionGrantChange,
	type StoredHtmlPermissionEpoch,
	type StoredHtmlPermissionGrant,
	type StoredHtmlPermissionRevision,
	type StoredHtmlPermissionRevocation,
} from "./IndexedDbHtmlPermissionGrantStore.utils"
import {
	notifyPermissionGrantChange,
	registerHtmlPermissionGrantChangeListener,
} from "./HtmlPermissionGrantNotifications"

let defaultPermissionGrantStore: IndexedDbHtmlPermissionGrantStore | null = null

export class IndexedDbHtmlPermissionGrantStore implements HtmlPermissionGrantStore {
	private readonly dbPromise: Promise<IDBDatabase | null>
	private sessionEpochPromise: Promise<number>
	private sessionRevisionPromise: Promise<number>

	constructor(private readonly getNow: () => number = () => Date.now()) {
		// Remove the previous localStorage cache so old grants cannot survive the storage migration.
		this.clearLegacyLocalStorage()
		this.dbPromise = this.openDatabase()
		const statePromise = this.dbPromise.then((db) =>
			db
				? this.readState(db).catch(() => ({ epoch: 0, revision: 0 }))
				: { epoch: 0, revision: 0 },
		)
		this.sessionEpochPromise = statePromise.then((state) => state.epoch)
		this.sessionRevisionPromise = statePromise.then((state) => state.revision)
		registerHtmlPermissionGrantChangeListener((change) => this.handleExternalChange(change))
	}

	async getGrant(
		identity: HtmlPermissionGrantIdentity,
		scope: HtmlPermissionScope,
	): Promise<HtmlPermissionGrant | undefined> {
		const grants = await this.getAppGrants(identity)
		return grants.find((grant) => grant.scope === scope)
	}

	async getAppGrants(identity: HtmlPermissionGrantIdentity): Promise<HtmlPermissionGrant[]> {
		const db = await this.dbPromise
		if (!db) return []
		try {
			const appKey = createHtmlPermissionAppKey(identity)
			const { epoch, records } = await this.readAppRecords(db, appKey)
			return records
				.filter(
					(record) =>
						isValidStoredGrant(record) &&
						record.epoch === epoch &&
						isHtmlPermissionGrantActive(this.toGrant(identity, record), this.getNow()),
				)
				.map((record) => this.toGrant(identity, record))
		} catch (error) {
			this.logStorageError("Failed to read permission grants from IndexedDB", error)
			return []
		}
	}

	async save(grant: HtmlPermissionGrant): Promise<void> {
		const db = await this.dbPromise
		if (!db) return
		const expectedEpoch = await this.sessionEpochPromise
		const expectedRevision = await this.sessionRevisionPromise
		let nextRevision: number | undefined
		try {
			await this.runWriteTransaction(db, async (transaction) => {
				const grantsStore = transaction.objectStore(GRANTS_STORE_NAME)
				const metaStore = transaction.objectStore(META_STORE_NAME)
				const state = await this.readStateInTransaction(transaction)
				if (state.epoch !== expectedEpoch) return
				const currentEpoch = state.epoch

				const appKey = createHtmlPermissionAppKey(grant)
				const key = grantRecordKey(appKey, grant.scope)
				if (state.revision !== expectedRevision) {
					const revocation = getStoredRevocation(
						await getRequestResult(metaStore.get(revocationMetaKey(key))),
					)
					if (
						revocation?.value.epoch === currentEpoch &&
						revocation.value.revision > expectedRevision
					) {
						return
					}
				}
				const record: StoredHtmlPermissionGrant = {
					key,
					appKey,
					scope: grant.scope,
					grantedAt: grant.grantedAt,
					expiresAt: grant.expiresAt,
					epoch: currentEpoch,
				}
				await getRequestResult(grantsStore.put(record))

				const currentRecords = (await getRequestResult(
					grantsStore.index("epoch").getAll(currentEpoch),
				)) as unknown[]
				const validCurrentRecords = currentRecords.filter(isValidStoredGrant)
				const allRecords = validCurrentRecords.filter((item) => item.key !== record.key)
				allRecords.push(record)
				if (allRecords.length > MAX_HTML_PERMISSION_GRANTS) {
					const overflow = allRecords
						.sort((a, b) => {
							if (a.expiresAt === null && b.expiresAt !== null) return 1
							if (a.expiresAt !== null && b.expiresAt === null) return -1
							return (
								(a.expiresAt ?? Number.POSITIVE_INFINITY) -
									(b.expiresAt ?? Number.POSITIVE_INFINITY) ||
								a.grantedAt - b.grantedAt
							)
						})
						.slice(0, allRecords.length - MAX_HTML_PERMISSION_GRANTS)
					for (const item of overflow)
						await getRequestResult(grantsStore.delete(item.key))
					htmlMicroAppPreviewLogger.warn("Permission grant limit exceeded", {
						limit: MAX_HTML_PERMISSION_GRANTS,
						evictedCount: overflow.length,
					})
				}
				nextRevision = state.revision + 1
				await this.putRevision(metaStore, nextRevision)
				await getRequestResult(metaStore.delete(revocationMetaKey(key)))
			})
			if (nextRevision !== undefined) {
				this.sessionRevisionPromise = Promise.resolve(nextRevision)
				notifyPermissionGrantChange({ epoch: expectedEpoch, revision: nextRevision })
			}
		} catch (error) {
			this.logStorageError("Failed to save permission grant to IndexedDB", error)
		}
	}

	async remove(
		identity: HtmlPermissionGrantIdentity,
		scope?: HtmlPermissionScope,
	): Promise<void> {
		const db = await this.dbPromise
		if (!db) return
		const expectedEpoch = await this.sessionEpochPromise
		let nextRevision: number | undefined
		try {
			await this.runWriteTransaction(db, async (transaction) => {
				const grantsStore = transaction.objectStore(GRANTS_STORE_NAME)
				const metaStore = transaction.objectStore(META_STORE_NAME)
				const state = await this.readStateInTransaction(transaction)
				if (state.epoch !== expectedEpoch) return

				const appKey = createHtmlPermissionAppKey(identity)
				const removedKeys: string[] = []
				if (scope) {
					const key = grantRecordKey(appKey, scope)
					const existing = await getRequestResult(grantsStore.get(key))
					if (!existing) return
					removedKeys.push(key)
					await getRequestResult(grantsStore.delete(key))
				} else {
					const records = (await getRequestResult(
						grantsStore.index("appKey").getAll(appKey),
					)) as StoredHtmlPermissionGrant[]
					if (records.length === 0) return
					for (const record of records) {
						removedKeys.push(record.key)
						await getRequestResult(grantsStore.delete(record.key))
					}
				}
				nextRevision = state.revision + 1
				await this.putRevision(metaStore, nextRevision)
				for (const key of removedKeys) {
					await getRequestResult(
						metaStore.put({
							key: revocationMetaKey(key),
							value: { epoch: state.epoch, revision: nextRevision },
						} satisfies StoredHtmlPermissionRevocation),
					)
				}
			})
			if (nextRevision !== undefined) {
				this.sessionRevisionPromise = Promise.resolve(nextRevision)
				notifyPermissionGrantChange({ epoch: expectedEpoch, revision: nextRevision })
			}
		} catch (error) {
			this.logStorageError("Failed to remove permission grant from IndexedDB", error)
		}
	}

	async prune(now: number): Promise<void> {
		const db = await this.dbPromise
		if (!db) return
		let nextRevision: number | undefined
		let currentEpoch = 0
		try {
			await this.runWriteTransaction(db, async (transaction) => {
				const grantsStore = transaction.objectStore(GRANTS_STORE_NAME)
				const metaStore = transaction.objectStore(META_STORE_NAME)
				const state = await this.readStateInTransaction(transaction)
				const epoch = state.epoch
				currentEpoch = epoch
				const records = (await getRequestResult(
					grantsStore.index("epoch").getAll(epoch),
				)) as unknown[]
				let changed = false
				for (const record of records) {
					if (
						!isValidStoredGrant(record) ||
						(record.expiresAt !== null && record.expiresAt <= now)
					) {
						await getRequestResult(grantsStore.delete(record.key))
						changed = true
					}
				}
				if (changed) {
					nextRevision = state.revision + 1
					await this.putRevision(metaStore, nextRevision)
				}
			})
			if (nextRevision !== undefined) {
				this.sessionRevisionPromise = Promise.resolve(nextRevision)
				notifyPermissionGrantChange({ epoch: currentEpoch, revision: nextRevision })
			}
		} catch (error) {
			this.logStorageError("Failed to prune permission grants from IndexedDB", error)
		}
	}

	async clear(): Promise<void> {
		const db = await this.dbPromise
		if (!db) {
			notifyPermissionGrantChange()
			return
		}
		let nextEpoch: number | undefined
		let nextRevision: number | undefined
		try {
			await this.runWriteTransaction(db, async (transaction) => {
				const grantsStore = transaction.objectStore(GRANTS_STORE_NAME)
				const metaStore = transaction.objectStore(META_STORE_NAME)
				const state = await this.readStateInTransaction(transaction)
				nextEpoch = state.epoch + 1
				nextRevision = state.revision + 1
				await getRequestResult(grantsStore.clear())
				const metaKeys = (await getRequestResult(metaStore.getAllKeys())) as IDBValidKey[]
				for (const key of metaKeys) {
					if (typeof key === "string" && key.startsWith(REVOCATION_META_PREFIX)) {
						await getRequestResult(metaStore.delete(key))
					}
				}
				await getRequestResult(
					metaStore.put({
						key: EPOCH_META_KEY,
						value: nextEpoch,
					} satisfies StoredHtmlPermissionEpoch),
				)
				await this.putRevision(metaStore, nextRevision)
			})
			if (nextEpoch !== undefined && nextRevision !== undefined) {
				this.sessionEpochPromise = Promise.resolve(nextEpoch)
				this.sessionRevisionPromise = Promise.resolve(nextRevision)
			}
		} catch (error) {
			this.logStorageError("Failed to clear permission grants from IndexedDB", error)
		} finally {
			notifyPermissionGrantChange(
				nextEpoch !== undefined && nextRevision !== undefined
					? { epoch: nextEpoch, revision: nextRevision, cleared: true }
					: undefined,
			)
		}
	}

	private openDatabase(): Promise<IDBDatabase | null> {
		if (typeof indexedDB === "undefined" || !indexedDB) return Promise.resolve(null)
		return new Promise((resolve) => {
			let request: IDBOpenDBRequest
			try {
				request = indexedDB.open(HTML_PERMISSION_DB_NAME, HTML_PERMISSION_DB_VERSION)
			} catch (error) {
				this.logStorageError("Failed to open permission grant IndexedDB", error)
				resolve(null)
				return
			}
			request.onupgradeneeded = () => {
				const db = request.result
				if (!db.objectStoreNames.contains(GRANTS_STORE_NAME)) {
					const grantsStore = db.createObjectStore(GRANTS_STORE_NAME, { keyPath: "key" })
					grantsStore.createIndex("appKey", "appKey", { unique: false })
					grantsStore.createIndex("epoch", "epoch", { unique: false })
				}
				if (!db.objectStoreNames.contains(META_STORE_NAME)) {
					db.createObjectStore(META_STORE_NAME, { keyPath: "key" })
				}
			}
			request.onsuccess = () => {
				const db = request.result
				db.onversionchange = () => db.close()
				resolve(db)
			}
			request.onerror = () => {
				this.logStorageError("Failed to open permission grant IndexedDB", request.error)
				resolve(null)
			}
			request.onblocked = () => {
				this.logStorageError("Permission grant IndexedDB open was blocked", request.error)
				resolve(null)
			}
		})
	}

	private async readState(db: IDBDatabase): Promise<HtmlPermissionGrantState> {
		const transaction = db.transaction(META_STORE_NAME, "readonly")
		return this.readStateInTransaction(transaction)
	}

	private async readStateInTransaction(
		transaction: IDBTransaction,
	): Promise<HtmlPermissionGrantState> {
		const metaStore = transaction.objectStore(META_STORE_NAME)
		const [epochRecord, revisionRecord] = await Promise.all([
			getRequestResult(metaStore.get(EPOCH_META_KEY)),
			getRequestResult(metaStore.get(REVISION_META_KEY)),
		])
		return {
			epoch: getStoredEpoch(epochRecord),
			revision: getStoredRevision(revisionRecord),
		}
	}

	private putRevision(metaStore: IDBObjectStore, revision: number): Promise<unknown> {
		return getRequestResult(
			metaStore.put({
				key: REVISION_META_KEY,
				value: revision,
			} satisfies StoredHtmlPermissionRevision),
		)
	}

	private readAppRecords(
		db: IDBDatabase,
		appKey: string,
	): Promise<{ epoch: number; records: StoredHtmlPermissionGrant[] }> {
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([GRANTS_STORE_NAME, META_STORE_NAME], "readonly")
			const grantsRequest = transaction
				.objectStore(GRANTS_STORE_NAME)
				.index("appKey")
				.getAll(appKey)
			const epochRequest = transaction.objectStore(META_STORE_NAME).get(EPOCH_META_KEY)
			let records: StoredHtmlPermissionGrant[] | undefined
			let epoch: number | undefined
			grantsRequest.onsuccess = () => {
				records = grantsRequest.result as StoredHtmlPermissionGrant[]
			}
			epochRequest.onsuccess = () => {
				epoch = getStoredEpoch(epochRequest.result)
			}
			transaction.oncomplete = () => resolve({ epoch: epoch ?? 0, records: records ?? [] })
			transaction.onerror = () => reject(getTransactionError(transaction))
			transaction.onabort = () => reject(getTransactionError(transaction))
		})
	}

	private runWriteTransaction(
		db: IDBDatabase,
		operation: (transaction: IDBTransaction) => Promise<void>,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const transaction = db.transaction([GRANTS_STORE_NAME, META_STORE_NAME], "readwrite")
			let operationError: unknown
			operation(transaction).catch((error) => {
				operationError = error
				try {
					transaction.abort()
				} catch {
					// The transaction may already be completing.
				}
			})
			transaction.oncomplete = () => {
				if (operationError) reject(operationError)
				else resolve()
			}
			transaction.onerror = () => reject(operationError || getTransactionError(transaction))
			transaction.onabort = () => reject(operationError || getTransactionError(transaction))
		})
	}

	private toGrant(
		identity: HtmlPermissionGrantIdentity,
		record: StoredHtmlPermissionGrant,
	): HtmlPermissionGrant {
		return {
			...identity,
			scope: record.scope,
			grantedAt: record.grantedAt,
			expiresAt: record.expiresAt,
		}
	}

	private clearLegacyLocalStorage() {
		try {
			globalThis.localStorage?.removeItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY)
		} catch (error) {
			this.logStorageError(
				"Failed to remove legacy permission grants from localStorage",
				error,
			)
		}
	}

	private logStorageError(message: string, error: unknown) {
		htmlMicroAppPreviewLogger.warn(message, {
			error: error instanceof Error ? error.message : String(error),
		})
	}

	private handleExternalChange(change: unknown) {
		if (!change || typeof change !== "object") return
		const value = change as Partial<HtmlPermissionGrantChange>
		if (
			value.type !== "changed" ||
			typeof value.epoch !== "number" ||
			typeof value.revision !== "number"
		) {
			return
		}
		const externalEpoch = value.epoch
		const externalRevision = value.revision
		void this.sessionEpochPromise.then((epoch) => {
			if (value.cleared) {
				if (externalEpoch > epoch) {
					this.sessionEpochPromise = Promise.resolve(externalEpoch)
					this.sessionRevisionPromise = Promise.resolve(externalRevision)
				}
				return
			}
			if (epoch !== externalEpoch) return
			void this.sessionRevisionPromise.then((revision) => {
				if (externalRevision > revision) {
					this.sessionRevisionPromise = Promise.resolve(externalRevision)
				}
			})
		})
	}
}

export function getHtmlPermissionGrantStore(): IndexedDbHtmlPermissionGrantStore {
	defaultPermissionGrantStore ??= new IndexedDbHtmlPermissionGrantStore()
	return defaultPermissionGrantStore
}
