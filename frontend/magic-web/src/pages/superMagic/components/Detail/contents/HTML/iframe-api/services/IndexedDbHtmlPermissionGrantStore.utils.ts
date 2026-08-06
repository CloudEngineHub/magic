import type { HtmlPermissionScope } from "../types"
import { isSupportedHtmlPermissionScope } from "./htmlPermissionPolicy"

export const HTML_PERMISSION_DB_NAME = "magic-html-permission-grants"
export const HTML_PERMISSION_DB_VERSION = 1
export const GRANTS_STORE_NAME = "grants"
export const META_STORE_NAME = "meta"
export const EPOCH_META_KEY = "epoch"
export const REVISION_META_KEY = "revision"
export const REVOCATION_META_PREFIX = "revoked:"

export interface StoredHtmlPermissionGrant {
	key: string
	appKey: string
	scope: HtmlPermissionScope
	grantedAt: number
	expiresAt: number | null
	epoch: number
}

export interface StoredHtmlPermissionEpoch {
	key: typeof EPOCH_META_KEY
	value: number
}

export interface StoredHtmlPermissionRevision {
	key: typeof REVISION_META_KEY
	value: number
}

export interface StoredHtmlPermissionRevocation {
	key: string
	value: { epoch: number; revision: number }
}

export interface HtmlPermissionGrantState {
	epoch: number
	revision: number
}

export interface HtmlPermissionGrantChange {
	type: "changed"
	epoch: number
	revision: number
	cleared?: boolean
}

export function grantRecordKey(appKey: string, scope: HtmlPermissionScope): string {
	return `${appKey}:${scope}`
}

export function isValidStoredGrant(value: unknown): value is StoredHtmlPermissionGrant {
	if (!value || typeof value !== "object") return false
	const grant = value as Partial<StoredHtmlPermissionGrant>
	return (
		typeof grant.key === "string" &&
		typeof grant.appKey === "string" &&
		typeof grant.scope === "string" &&
		isSupportedHtmlPermissionScope(grant.scope) &&
		grant.key === grantRecordKey(grant.appKey, grant.scope) &&
		typeof grant.grantedAt === "number" &&
		Number.isFinite(grant.grantedAt) &&
		(grant.expiresAt === null ||
			(typeof grant.expiresAt === "number" && Number.isFinite(grant.expiresAt))) &&
		typeof grant.epoch === "number" &&
		Number.isInteger(grant.epoch) &&
		grant.epoch >= 0
	)
}

export function getRequestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error || new Error("IndexedDB request failed"))
	})
}

export function getTransactionError(transaction: IDBTransaction): Error {
	return transaction.error || new Error("IndexedDB transaction failed")
}

export function getStoredEpoch(value: unknown): number {
	if (!value || typeof value !== "object") return 0
	const epoch = (value as Partial<StoredHtmlPermissionEpoch>).value
	return typeof epoch === "number" && Number.isInteger(epoch) && epoch >= 0 ? epoch : 0
}

export function getStoredRevision(value: unknown): number {
	if (!value || typeof value !== "object") return 0
	const revision = (value as Partial<StoredHtmlPermissionRevision>).value
	return typeof revision === "number" && Number.isInteger(revision) && revision >= 0
		? revision
		: 0
}

export function getStoredRevocation(value: unknown): StoredHtmlPermissionRevocation | undefined {
	if (!value || typeof value !== "object") return undefined
	const revocation = value as Partial<StoredHtmlPermissionRevocation>
	if (typeof revocation.key !== "string" || !revocation.key.startsWith(REVOCATION_META_PREFIX)) {
		return undefined
	}
	const state = revocation.value
	if (
		!state ||
		typeof state !== "object" ||
		typeof state.epoch !== "number" ||
		!Number.isInteger(state.epoch) ||
		state.epoch < 0 ||
		typeof state.revision !== "number" ||
		!Number.isInteger(state.revision) ||
		state.revision < 0
	) {
		return undefined
	}
	return revocation as StoredHtmlPermissionRevocation
}

export function revocationMetaKey(recordKey: string): string {
	return `${REVOCATION_META_PREFIX}${recordKey}`
}
