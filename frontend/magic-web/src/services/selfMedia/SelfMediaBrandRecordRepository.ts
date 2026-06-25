import { GlobalBaseRepository } from "@/models/repository/GlobalBaseRepository"
import type { StoredBrandRecord } from "./types"

const LOCALSTORAGE_KEY = "MAGIC:self-media-brand-records"
const MIGRATION_FLAG_KEY = "MAGIC:self-media-brand-records-migrated"

export class SelfMediaBrandRecordRepository extends GlobalBaseRepository<StoredBrandRecord> {
    static tableName = "self-media-brand-records"

    constructor() {
        super(SelfMediaBrandRecordRepository.tableName)
    }

    async upsert(record: StoredBrandRecord): Promise<void> {
        await this.put(record)
    }

    async listByUser(userId: string, organizationCode: string): Promise<StoredBrandRecord[]> {
        const rows = await this.getAll()
        return rows
            .filter((r) => r.userId === userId && r.organizationCode === organizationCode)
            .sort((a, b) => b.updatedAt - a.updatedAt)
    }

    async deleteById(id: string): Promise<void> {
        await this.delete(id)
    }

    /**
     * 从 localStorage 一次性迁移品牌记录到 IndexedDB。
     * 迁移成功后设置标记，后续不再重复执行。
     */
    async migrateFromLocalStorage(userId: string, organizationCode: string): Promise<boolean> {
        try {
            // 已迁移则跳过
            if (localStorage.getItem(MIGRATION_FLAG_KEY)) {
                return false
            }

            const raw = localStorage.getItem(LOCALSTORAGE_KEY)
            if (!raw) {
                localStorage.setItem(MIGRATION_FLAG_KEY, "1")
                return false
            }

            const records: Array<{
                author: string
                brandPosition: string
                targetAudience?: string
            }> = JSON.parse(raw)

            if (!Array.isArray(records) || records.length === 0) {
                localStorage.setItem(MIGRATION_FLAG_KEY, "1")
                return false
            }

            const now = Date.now()
            for (let i = 0; i < records.length; i++) {
                const r = records[i]
                const entity: StoredBrandRecord = {
                    id: crypto.randomUUID(),
                    userId,
                    organizationCode,
                    author: r.author || "",
                    brandPosition: r.brandPosition || "",
                    targetAudience: r.targetAudience || "",
                    createdAt: now - (records.length - i) * 1000, // 保持顺序
                    updatedAt: now - (records.length - i) * 1000,
                }
                await this.put(entity)
            }

            // 标记已迁移 & 清除旧数据
            localStorage.setItem(MIGRATION_FLAG_KEY, "1")
            localStorage.removeItem(LOCALSTORAGE_KEY)
            return true
        } catch {
            // 迁移失败不阻塞，下次重试
            return false
        }
    }
}
