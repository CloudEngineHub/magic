export type BrowserNotificationPayload = {
	title: string
	body?: string
	tag?: string
	icon?: string
	data?: Record<string, unknown>
	onClick?: () => void
	onError?: () => void
}
