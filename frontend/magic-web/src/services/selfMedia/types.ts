// ─── Brand Record (品牌信息历史，从 localStorage 迁移) ────────────────────

export interface StoredBrandRecord {
    /** Primary key: UUID */
    id: string
    userId: string
    organizationCode: string
    author: string
    brandPosition: string
    targetAudience: string
    createdAt: number
    updatedAt: number
}
