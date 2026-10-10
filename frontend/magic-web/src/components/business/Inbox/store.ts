import { makeAutoObservable, runInAction } from "mobx"
import i18next from "i18next"
import { NotificationApi } from "@/apis"
import type { NotificationListResult } from "@/apis/modules/notifications"
import { logger as Logger } from "@/infrastructure/logger"
import { formatUnreadCount } from "./formatUnreadCount"
import { mapNotificationItem, toApiCategory } from "./mapNotification"
import {
	getBusinessCode,
	NOTIFICATION_ERROR_CODE,
	shouldRefreshAfterNotificationError,
} from "./notificationErrors"
import { notificationLocaleFromI18n, readTemplateCache, writeTemplateCache } from "./templateCache"
import type {
	InboxAuthStatus,
	InboxMessage,
	InboxMessageId,
	InboxTab,
	InboxTemplateCatalog,
} from "./types"

const logger = Logger.createLogger("InboxStore")
const PAGE_SIZE = 10
const MARK_ALL_PAGE_SIZE = 100
const MARK_ALL_MAX_PAGES = 10

export class InboxStore {
	visible = false
	activeTab: InboxTab = "all"
	messages: InboxMessage[] = []
	nextCursor: string | null = null
	hasMore = false
	listLoading = false
	listLoadingMore = false
	systemUnread = 0
	authorizationPending = 0
	catalog: InboxTemplateCatalog | null = null
	actingIds: Record<string, true> = {}
	private listRequestId = 0
	private countsRequest: Promise<void> | null = null

	constructor() {
		makeAutoObservable(this, {}, { autoBind: true })
	}

	get unreadTotal() {
		return this.systemUnread + this.authorizationPending
	}

	get unreadSystem() {
		return this.systemUnread
	}

	get unreadAuth() {
		return this.authorizationPending
	}

	get unreadTotalLabel() {
		return formatUnreadCount(this.unreadTotal)
	}

	get unreadSystemLabel() {
		return formatUnreadCount(this.unreadSystem)
	}

	get unreadAuthLabel() {
		return formatUnreadCount(this.unreadAuth)
	}

	get visibleMessages() {
		return this.messages
	}

	getTemplate(type: string, version: number) {
		return this.catalog?.templates[`${type}:${version}`] ?? null
	}

	open() {
		this.visible = true
		void this.refresh()
	}

	close() {
		this.visible = false
	}

	setActiveTab(tab: InboxTab) {
		if (this.activeTab === tab) return Promise.resolve()
		this.activeTab = tab
		this.messages = []
		this.nextCursor = null
		this.hasMore = false
		if (this.visible) return this.reloadList()
		return Promise.resolve()
	}

	async refresh() {
		await Promise.all([this.loadCounts(), this.loadTemplates(), this.reloadList()])
	}

	async loadCounts() {
		if (this.countsRequest) return this.countsRequest
		this.countsRequest = this.fetchCounts().finally(() => {
			this.countsRequest = null
		})
		return this.countsRequest
	}

	private async fetchCounts() {
		try {
			const counts = await NotificationApi.getNotificationCounts()
			runInAction(() => {
				this.systemUnread = counts.system_unread ?? 0
				this.authorizationPending = counts.authorization_pending ?? 0
			})
		} catch (error) {
			logger.error({
				eventKey: "inbox_counts_failed",
				errorKind: "network",
				error,
				message: "Failed to load notification counts",
			})
		}
	}

	async loadTemplates(language = i18next.language) {
		const locale = notificationLocaleFromI18n(language)
		const cached = readTemplateCache(locale) ?? readTemplateCache("zh-CN")
		if (cached && !this.catalog) {
			runInAction(() => {
				this.catalog = cached
			})
		}

		try {
			const catalog = await NotificationApi.getNotificationTemplates(locale)
			runInAction(() => {
				this.catalog = catalog
			})
			writeTemplateCache(catalog)
		} catch (error) {
			logger.error({
				eventKey: "inbox_templates_failed",
				errorKind: "network",
				error,
				message: "Failed to load notification templates; using cache if present",
				context: { locale },
			})
			if (!this.catalog && cached) {
				runInAction(() => {
					this.catalog = cached
				})
			}
		}
	}

	async reloadList() {
		if (!this.visible) return
		const requestId = ++this.listRequestId
		this.listLoading = true
		this.nextCursor = null
		this.hasMore = false
		try {
			const page = await this.fetchPage()
			if (requestId !== this.listRequestId) return
			runInAction(() => {
				this.messages = page.items.map(mapNotificationItem)
				this.nextCursor = page.next_cursor
				this.hasMore = page.has_more
				this.listLoading = false
			})
		} catch (error) {
			if (requestId !== this.listRequestId) return
			logger.error({
				eventKey: "inbox_list_failed",
				errorKind: "network",
				error,
				message: "Failed to load notification list",
			})
			runInAction(() => {
				this.messages = []
				this.listLoading = false
			})
		}
	}

	async loadMore() {
		if (!this.visible || this.listLoading || this.listLoadingMore || !this.hasMore) return
		this.listLoadingMore = true
		const cursor = this.nextCursor
		try {
			const page = await this.fetchPage(cursor ?? undefined)
			runInAction(() => {
				this.messages = [...this.messages, ...page.items.map(mapNotificationItem)]
				this.nextCursor = page.next_cursor
				this.hasMore = page.has_more
				this.listLoadingMore = false
			})
		} catch (error) {
			logger.error({
				eventKey: "inbox_list_more_failed",
				errorKind: "network",
				error,
				message: "Failed to load more notifications",
			})
			runInAction(() => {
				this.listLoadingMore = false
			})
		}
	}

	async markRead(id: InboxMessageId) {
		const message = this.messages.find((item) => item.id === id)
		if (!message || message.category === "auth" || !message.is_unread) return
		message.is_unread = false
		if (this.systemUnread > 0) this.systemUnread -= 1
		try {
			await NotificationApi.markNotificationRead(id)
		} catch (error) {
			runInAction(() => {
				message.is_unread = true
				this.systemUnread += 1
			})
			if (shouldRefreshAfterNotificationError(getBusinessCode(error))) {
				await this.refreshAfterMutation()
			}
		}
	}

	async markAllSystemRead() {
		const ids: string[] = []
		let cursor: string | undefined
		for (let pageIndex = 0; pageIndex < MARK_ALL_MAX_PAGES; pageIndex += 1) {
			const page = await NotificationApi.listNotifications({
				category: "system",
				cursor,
				page_size: MARK_ALL_PAGE_SIZE,
			})
			page.items.forEach((item) => {
				if (item.read_status === "unread") ids.push(item.notification_id)
			})
			if (!page.has_more || !page.next_cursor) break
			cursor = page.next_cursor
		}
		await Promise.all(
			ids.map((id) => NotificationApi.markNotificationRead(id).catch(() => undefined)),
		)
		this.messages.forEach((message) => {
			if (message.category === "system") message.is_unread = false
		})
		await this.refreshAfterMutation()
	}

	async respondAuth(id: InboxMessageId, status: Exclude<InboxAuthStatus, "pending">) {
		const message = this.messages.find((item) => item.id === id)
		if (!message || message.category !== "auth" || message.auth_status !== "pending") return
		if (this.actingIds[id]) return

		this.actingIds = { ...this.actingIds, [id]: true }
		try {
			if (status === "accepted") {
				const result = await NotificationApi.acceptNotification(id)
				runInAction(() => {
					message.auth_status = "accepted"
					message.business_result = result.business_result
					message.is_unread = false
				})
			} else {
				await NotificationApi.rejectNotification(id)
				runInAction(() => {
					message.auth_status = "rejected"
					message.is_unread = false
				})
			}
			if (this.authorizationPending > 0) this.authorizationPending -= 1
			await this.loadCounts()
			return { ok: true as const, expired: message.business_result === "expired" }
		} catch (error) {
			const code = getBusinessCode(error)
			if (code === NOTIFICATION_ERROR_CODE.EXPIRED) {
				runInAction(() => {
					message.auth_status = status
					message.business_result = "expired"
					message.is_unread = false
				})
				await this.refreshAfterMutation()
				return { ok: true as const, expired: true }
			}
			if (shouldRefreshAfterNotificationError(code)) {
				await this.refreshAfterMutation()
				return { ok: false as const, withdrawn: code === NOTIFICATION_ERROR_CODE.WITHDRAWN }
			}
			return { ok: false as const }
		} finally {
			runInAction(() => {
				const { [id]: _removed, ...rest } = this.actingIds
				this.actingIds = rest
			})
		}
	}

	clearUserCache() {
		this.messages = []
		this.nextCursor = null
		this.hasMore = false
		this.systemUnread = 0
		this.authorizationPending = 0
		this.actingIds = {}
		this.listRequestId += 1
	}

	reset() {
		this.visible = false
		this.activeTab = "all"
		this.listLoading = false
		this.listLoadingMore = false
		this.catalog = null
		this.clearUserCache()
	}

	private async refreshAfterMutation() {
		await Promise.all([this.loadCounts(), this.visible ? this.reloadList() : Promise.resolve()])
	}

	private fetchPage(cursor?: string): Promise<NotificationListResult> {
		return NotificationApi.listNotifications({
			category: toApiCategory(this.activeTab),
			cursor,
			page_size: PAGE_SIZE,
		})
	}
}

export const inboxStore = new InboxStore()

export function openInbox() {
	inboxStore.open()
}

export function clearInboxUserCache() {
	inboxStore.clearUserCache()
}
