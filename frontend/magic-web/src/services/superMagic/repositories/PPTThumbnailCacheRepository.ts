import type Dexie from "dexie"
import type { Table } from "dexie"
import { GlobalBaseRepository } from "@/models/repository/GlobalBaseRepository"

export const PPT_THUMBNAIL_CACHE_POLICY = {
	maxBytes: 100 * 1024 * 1024,
	maxEntries: 2000,
	maxEntryBytes: 1024 * 1024,
	maxIdleAgeMs: 30 * 24 * 60 * 60 * 1000,
	touchIntervalMs: 60 * 1000,
	quotaRecoveryRatio: 0.8,
} as const

export interface PPTThumbnailCacheKey {
	key: string
	scope: string
	slideIdentity: string
	path: string
}

interface ThumbnailMetadata extends PPTThumbnailCacheKey {
	byteSize: number
	mimeType: string
	createdAt: number
	lastAccessAt: number
}

interface ThumbnailBody {
	key: string
	bytes: ArrayBuffer
}

interface ThumbnailTables {
	metadata: Table<ThumbnailMetadata, string>
	bodies: Table<ThumbnailBody, string>
}

function isExpired(record: ThumbnailMetadata, now: number): boolean {
	return (
		!Number.isFinite(record.lastAccessAt) ||
		now - record.lastAccessAt >= PPT_THUMBNAIL_CACHE_POLICY.maxIdleAgeMs ||
		!Number.isFinite(record.byteSize) ||
		record.byteSize <= 0
	)
}

function isQuotaError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false
	return (
		("name" in error && error.name === "QuotaExceededError") ||
		("inner" in error && isQuotaError(error.inner))
	)
}

/** 只管理可重建的 PPT 图片；容量统计读元数据，不把所有图片体加载进内存。 */
export class PPTThumbnailCacheRepository extends GlobalBaseRepository<ThumbnailMetadata> {
	static readonly tableName = "ppt-thumbnail-cache"
	static readonly bodyTableName = "ppt-thumbnail-cache-body"
	private sweepStarted = false

	constructor() {
		super(PPTThumbnailCacheRepository.tableName)
	}

	async getThumbnail(key: string): Promise<Blob | null> {
		if (!this.sweepStarted) {
			this.sweepStarted = true
			void this.prune()
		}
		try {
			return await this.executeWithErrorHandling("getThumbnail", async () => {
				const db = await this.getDB()
				const tables = this.tables(db)
				return db.transaction("rw", tables.metadata, tables.bodies, async () => {
					const record = await tables.metadata.get(key)
					const now = Date.now()
					if (!record || isExpired(record, now)) {
						await this.remove(tables, [key])
						return null
					}
					const body = await tables.bodies.get(key)
					if (
						!(body?.bytes instanceof ArrayBuffer) ||
						body.bytes.byteLength !== record.byteSize ||
						record.byteSize > PPT_THUMBNAIL_CACHE_POLICY.maxEntryBytes ||
						record.mimeType !== "image/webp"
					) {
						await this.remove(tables, [key])
						return null
					}
					if (now - record.lastAccessAt >= PPT_THUMBNAIL_CACHE_POLICY.touchIntervalMs) {
						await tables.metadata.update(key, { lastAccessAt: now })
					}
					return new Blob([body.bytes], { type: record.mimeType })
				})
			})
		} catch {
			return null
		}
	}

	async putThumbnail(
		identity: PPTThumbnailCacheKey,
		blob: Blob,
		shouldCommit: () => boolean,
	): Promise<boolean> {
		if (
			!shouldCommit() ||
			blob.type !== "image/webp" ||
			blob.size === 0 ||
			blob.size > PPT_THUMBNAIL_CACHE_POLICY.maxEntryBytes
		) {
			return false
		}
		try {
			// 字节转换必须在事务外完成，避免等待非数据库 Promise 使事务提前提交。
			const bytes = await blob.arrayBuffer()
			return await this.executeWithErrorHandling("putThumbnail", async () => {
				const db = await this.getDB()
				const tables = this.tables(db)
				const write = () =>
					db.transaction("rw", tables.metadata, tables.bodies, async () => {
						if (!shouldCommit()) return false
						await this.pruneTables(tables, blob.size, identity.key)
						if (!shouldCommit()) return false
						const now = Date.now()
						await tables.metadata.put({
							...identity,
							byteSize: bytes.byteLength,
							mimeType: blob.type,
							createdAt: now,
							lastAccessAt: now,
						})
						await tables.bodies.put({ key: identity.key, bytes })
						return true
					})
				try {
					return await write()
				} catch (error) {
					// 在公共 Repository 包装错误前识别配额；恢复只淘汰本缓存，最多重试一次。
					if (!isQuotaError(error) || !shouldCommit()) throw error
					await db.transaction("rw", tables.metadata, tables.bodies, () =>
						this.pruneTables(
							tables,
							0,
							undefined,
							PPT_THUMBNAIL_CACHE_POLICY.quotaRecoveryRatio,
						),
					)
					return write()
				}
			})
		} catch {
			return false
		}
	}

	async deleteThumbnail(key: string): Promise<void> {
		try {
			await this.executeWithErrorHandling("deleteThumbnail", async () => {
				const db = await this.getDB()
				const tables = this.tables(db)
				await db.transaction("rw", tables.metadata, tables.bodies, () =>
					this.remove(tables, [key]),
				)
			})
		} catch {
			// 清除损坏缓存失败不能阻断用户主动重新生成。
		}
	}

	async prune(): Promise<void> {
		try {
			await this.executeWithErrorHandling("pruneThumbnails", async () => {
				const db = await this.getDB()
				const tables = this.tables(db)
				await db.transaction("rw", tables.metadata, tables.bodies, () =>
					this.pruneTables(tables),
				)
			})
		} catch {
			// 浏览器可能禁止持久存储；清理与读取失败都不改变预览可用性。
		}
	}

	private tables(db: Dexie): ThumbnailTables {
		return {
			metadata: db.table(PPTThumbnailCacheRepository.tableName),
			bodies: db.table(PPTThumbnailCacheRepository.bodyTableName),
		}
	}

	private async remove(tables: ThumbnailTables, keys: string[]): Promise<void> {
		if (keys.length === 0) return
		await tables.metadata.bulkDelete(keys)
		await tables.bodies.bulkDelete(keys)
	}

	private async pruneTables(
		tables: ThumbnailTables,
		incomingBytes = 0,
		replacingKey?: string,
		budgetRatio = 1,
	): Promise<void> {
		const records = await tables.metadata.orderBy("lastAccessAt").toArray()
		const now = Date.now()
		const expired = records.filter((record) => isExpired(record, now))
		const active = records.filter(
			(record) => !isExpired(record, now) && record.key !== replacingKey,
		)
		const toDelete = expired.map((record) => record.key)
		let bytes = active.reduce((sum, record) => sum + record.byteSize, incomingBytes)
		let entries = active.length + (replacingKey ? 1 : 0)
		const maxBytes = PPT_THUMBNAIL_CACHE_POLICY.maxBytes * budgetRatio
		const maxEntries = Math.floor(PPT_THUMBNAIL_CACHE_POLICY.maxEntries * budgetRatio)
		for (const record of active) {
			if (bytes <= maxBytes && entries <= maxEntries) break
			toDelete.push(record.key)
			bytes -= record.byteSize
			entries -= 1
		}
		await this.remove(tables, toDelete)
	}
}

export const pptThumbnailCacheRepository = new PPTThumbnailCacheRepository()
