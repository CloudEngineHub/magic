/** 分页响应 */
export interface WithPageToken<T> {
	page_token: string
	has_more: boolean
	items: T[]
}
