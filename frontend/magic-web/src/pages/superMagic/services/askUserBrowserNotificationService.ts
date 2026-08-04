import i18n from "i18next"
import {
	browserNotificationPreference,
	browserNotificationService,
} from "@/services/browserNotification"
import {
	ASK_USER_CARD_STATUS,
	ASK_USER_TOOL,
} from "@/pages/superMagic/components/MessageList/utils/askUserConstants"
import {
	extractQuestionsField,
	parseQuestionsXml,
} from "@/pages/superMagic/components/MessageList/components/Nodes/MessageNode/tool-call/tools/AskUser/parse"
import type {
	RawSuperMagicMessageNode,
	ToolCall,
	ToolResponseState,
} from "@/pages/superMagic/stores/types"

const notifiedAskUserKeys = new Set<string>()
const seenAskUserKeys = new Set<string>()
const activeAskUserNotifications = new Map<string, Notification>()
const askUserExpireTimers = new Map<string, ReturnType<typeof window.setTimeout>>()
const pendingAskUserNotifications = new Map<
	string,
	{
		title: string
		body?: string
	}
>()
const serviceStartedAtMs = Date.now()
let visibilityListenerInitialized = false

interface NotifyAskUserV2BrowserNotificationParams {
	topicId: string
	messageNode: RawSuperMagicMessageNode | undefined
	messageSendTime?: number
}

interface ClearAskUserV2BrowserNotificationParams {
	topicId: string
	notificationKey: string
}

function getDetailQuestionLabel(questions: unknown) {
	if (!Array.isArray(questions)) return ""

	for (const question of questions) {
		const label = (question as { question?: unknown } | undefined)?.question
		if (typeof label === "string" && label.trim()) return label.trim()
	}

	return ""
}

function normalizeAskUserStatus(status: unknown) {
	if (status === ASK_USER_CARD_STATUS.answered) return ASK_USER_CARD_STATUS.answered
	if (status === ASK_USER_CARD_STATUS.skipped) return ASK_USER_CARD_STATUS.skipped
	if (status === ASK_USER_CARD_STATUS.timeout) return ASK_USER_CARD_STATUS.timeout
	if (status === ASK_USER_CARD_STATUS.cancelled) return ASK_USER_CARD_STATUS.cancelled
	return ASK_USER_CARD_STATUS.pending
}

function getQuestionsXml(toolCall: ToolCall, tool?: ToolResponseState) {
	const rawArguments = toolCall.function?.arguments || ""
	const questionsFromArguments = extractQuestionsField(rawArguments)
	const detailQuestions = tool?.detail?.data?.questions
	const questionsFromDetail = typeof detailQuestions === "string" ? detailQuestions : ""

	return questionsFromArguments || questionsFromDetail
}

function getAskUserNotificationBody(toolCall: ToolCall, tool?: ToolResponseState) {
	const detailQuestionLabel = getDetailQuestionLabel(tool?.detail?.data?.questions)
	if (detailQuestionLabel) return detailQuestionLabel

	const questions = parseQuestionsXml(getQuestionsXml(toolCall, tool))
	if (questions.length === 0 || questions.some((question) => !question.isComplete)) return null

	return questions.find((question) => question.label)?.label
}

function getAskUserNotificationKey(toolCall: ToolCall, tool?: ToolResponseState) {
	const detailQuestionId = tool?.detail?.data?.question_id
	const questionId = typeof detailQuestionId === "string" ? detailQuestionId : ""

	return questionId || tool?.id || toolCall.id
}

function normalizeExpiresAtToSeconds(value: unknown): number | null {
	const numericValue =
		typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
	if (!Number.isFinite(numericValue) || numericValue <= 0) return null

	if (numericValue > 1e11) return Math.floor(numericValue / 1000)
	return Math.floor(numericValue)
}

function isAskUserExpired(tool?: ToolResponseState) {
	const expiresAt = normalizeExpiresAtToSeconds(tool?.detail?.data?.expires_at)
	if (!expiresAt) return false
	return expiresAt <= Math.floor(Date.now() / 1000)
}

function getAskUserExpiresAt(tool?: ToolResponseState) {
	return normalizeExpiresAtToSeconds(tool?.detail?.data?.expires_at)
}

function normalizeMessageSendTimeToMs(value: unknown): number | null {
	const numericValue =
		typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
	if (!Number.isFinite(numericValue) || numericValue <= 0) return null

	if (numericValue < 1e11) return Math.floor(numericValue * 1000)
	if (numericValue < 1e14) return Math.floor(numericValue)
	if (numericValue < 1e17) return Math.floor(numericValue / 1000)
	return Math.floor(numericValue / 1e6)
}

function isNewMessage(messageSendTime: unknown) {
	const sendTimeMs = normalizeMessageSendTimeToMs(messageSendTime)
	if (!sendTimeMs) return false
	return sendTimeMs >= serviceStartedAtMs - 60 * 1000
}

function buildScopedNotificationKey(topicId: string, notificationKey: string) {
	return `${topicId}:${notificationKey}`
}

function isPageNotActive() {
	return document.visibilityState === "hidden" || !document.hasFocus()
}

function clearAskUserNotification(notificationKey: string) {
	const expireTimer = askUserExpireTimers.get(notificationKey)
	if (expireTimer) {
		window.clearTimeout(expireTimer)
		askUserExpireTimers.delete(notificationKey)
	}

	pendingAskUserNotifications.delete(notificationKey)
	seenAskUserKeys.delete(notificationKey)
	notifiedAskUserKeys.delete(notificationKey)

	const activeNotification = activeAskUserNotifications.get(notificationKey)
	if (activeNotification) {
		activeAskUserNotifications.delete(notificationKey)
		activeNotification.close()
	}
}

function scheduleAskUserExpireCleanup(notificationKey: string, expiresAt: number | null) {
	if (!expiresAt) return

	const existingTimer = askUserExpireTimers.get(notificationKey)
	if (existingTimer) window.clearTimeout(existingTimer)

	const delay = Math.max(0, expiresAt * 1000 - Date.now())
	const expireTimer = window.setTimeout(() => {
		clearAskUserNotification(notificationKey)
	}, delay)

	askUserExpireTimers.set(notificationKey, expireTimer)
}

export function clearAskUserV2BrowserNotification({
	topicId,
	notificationKey,
}: ClearAskUserV2BrowserNotificationParams) {
	if (!topicId || !notificationKey) return
	clearAskUserNotification(buildScopedNotificationKey(topicId, notificationKey))
}

function tryNotifyAskUser(notificationKey: string) {
	const pendingNotification = pendingAskUserNotifications.get(notificationKey)
	if (!pendingNotification) return
	if (!isPageNotActive()) return
	if (!browserNotificationPreference.getEnabled()) return
	if (notifiedAskUserKeys.has(notificationKey)) return

	if (!browserNotificationService.canNotify()) {
		browserNotificationPreference.setEnabled(false)
		return
	}

	const notification = browserNotificationService.show({
		title: pendingNotification.title,
		body: pendingNotification.body,
		tag: notificationKey,
		data: {
			type: "ask-user",
			questionId: notificationKey,
		},
	})

	if (notification) {
		notification.onclose = () => {
			activeAskUserNotifications.delete(notificationKey)
		}
		notifiedAskUserKeys.add(notificationKey)
		activeAskUserNotifications.set(notificationKey, notification)
		pendingAskUserNotifications.delete(notificationKey)
	}
}

function ensureVisibilityListener() {
	if (visibilityListenerInitialized || typeof document === "undefined") return
	visibilityListenerInitialized = true

	const notifyPendingAskUsers = () => {
		if (!isPageNotActive()) return
		pendingAskUserNotifications.forEach((_, notificationKey) => {
			tryNotifyAskUser(notificationKey)
		})
	}

	document.addEventListener("visibilitychange", notifyPendingAskUsers)
	window.addEventListener("blur", notifyPendingAskUsers)
}

function notifyAskUserToolCall(topicId: string, toolCall: ToolCall) {
	const tool = toolCall.tool
	const toolName = tool?.name || toolCall.function?.name
	if (toolName !== ASK_USER_TOOL.name) return

	const rawNotificationKey = getAskUserNotificationKey(toolCall, tool)
	if (!rawNotificationKey) return

	const notificationKey = buildScopedNotificationKey(topicId, rawNotificationKey)

	const status = normalizeAskUserStatus(tool?.status || tool?.detail?.data?.status)
	const expiresAt = getAskUserExpiresAt(tool)
	if (status !== ASK_USER_CARD_STATUS.pending || isAskUserExpired(tool)) {
		clearAskUserNotification(notificationKey)
		return
	}
	if (notifiedAskUserKeys.has(notificationKey) || seenAskUserKeys.has(notificationKey)) return

	const notificationBody = getAskUserNotificationBody(toolCall, tool)
	if (notificationBody === null) return

	if (!isPageNotActive()) {
		seenAskUserKeys.add(notificationKey)
		pendingAskUserNotifications.delete(notificationKey)
		return
	}

	pendingAskUserNotifications.set(notificationKey, {
		title: i18n.t("askUser.title", { ns: "super" }),
		body: notificationBody,
	})
	scheduleAskUserExpireCleanup(notificationKey, expiresAt)

	tryNotifyAskUser(notificationKey)
}

export function notifyAskUserV2BrowserNotificationFromMessageNode({
	topicId,
	messageNode,
	messageSendTime,
}: NotifyAskUserV2BrowserNotificationParams) {
	if (!messageNode || typeof document === "undefined") return
	if (!topicId || !isNewMessage(messageSendTime)) return
	if (!Array.isArray(messageNode.tool_calls)) return

	ensureVisibilityListener()
	messageNode.tool_calls.forEach((toolCall) => {
		notifyAskUserToolCall(topicId, toolCall as ToolCall)
	})
}
