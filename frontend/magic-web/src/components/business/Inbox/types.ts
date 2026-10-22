export type InboxCategory = "system" | "auth"
export type InboxTab = "all" | InboxCategory
export type InboxAuthStatus = "pending" | "accepted" | "rejected"

export type InboxIconName =
	| "users"
	| "share"
	| "project"
	| "file"
	| "alert"
	| "spark"
	| "points"
	| "payment"
	| "success"
	| "robot"

export type InboxMessageId = string

export interface InboxMessage {
	id: InboxMessageId
	category: InboxCategory
	type: string
	template_version: number
	payload: Record<string, unknown>
	created_at: string
	is_unread: boolean
	auth_status?: InboxAuthStatus
	business_result?: "applied" | "expired"
}

export interface InboxTemplateCatalog {
	locale: string
	catalog_version: number
	templates: Record<string, { title_template: string; body_template: string }>
}
