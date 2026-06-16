import { SelfMediaBrandRecordRepository } from "./SelfMediaBrandRecordRepository"
import type { StoredBrandRecord } from "./types"

/**
 * 品牌记录服务。
 * 首次使用时自动从 localStorage 迁移到 IndexedDB。
 */
export class SelfMediaBrandRecordService {
    private repo = new SelfMediaBrandRecordRepository()
    private userId: string
    private organizationCode: string
    private migrated = false

    constructor(userId: string, organizationCode: string) {
        this.userId = userId
        this.organizationCode = organizationCode
    }

    /**
     * 确保迁移已执行（幂等）
     */
    private async ensureMigrated(): Promise<void> {
        if (this.migrated) return
        try {
            await this.repo.migrateFromLocalStorage(this.userId, this.organizationCode)
        } catch {
            // silent
        }
        this.migrated = true
    }

    /**
     * 获取品牌记录列表（按更新时间倒序）
     */
    async listRecords(): Promise<StoredBrandRecord[]> {
        await this.ensureMigrated()
        try {
            return await this.repo.listByUser(this.userId, this.organizationCode)
        } catch {
            return []
        }
    }

    /**
     * 保存/更新一条品牌记录
     */
    async saveRecord(params: {
        author: string
        brandPosition: string
        targetAudience: string
        id?: string
    }): Promise<StoredBrandRecord> {
        await this.ensureMigrated()
        const now = Date.now()
        const record: StoredBrandRecord = {
            id: params.id || crypto.randomUUID(),
            userId: this.userId,
            organizationCode: this.organizationCode,
            author: params.author,
            brandPosition: params.brandPosition,
            targetAudience: params.targetAudience,
            createdAt: now,
            updatedAt: now,
        }

        // 如果是更新已有记录，保留 createdAt
        if (params.id) {
            try {
                const existing = await this.repo.listByUser(this.userId, this.organizationCode)
                const found = existing.find((r) => r.id === params.id)
                if (found) {
                    record.createdAt = found.createdAt
                }
            } catch {
                // use now as fallback
            }
        }

        await this.repo.upsert(record)
        return record
    }

    /**
     * 删除一条品牌记录
     */
    async deleteRecord(id: string): Promise<void> {
        try {
            await this.repo.deleteById(id)
        } catch {
            // silent
        }
    }
}
