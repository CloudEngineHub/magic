import type { ToolDataLike } from "@/pages/superMagic/components/MessageList/components/Nodes/ToolCall/tools/DefaultTool"
import { superMagicStore } from "@/pages/superMagic/stores"

export const MICRO_APP_PLAN_TOOL_NAME = "micro_app_plan"

export const PLAN_STATUS = {
	pending: "pending",
	approved: "approved",
	revisionRequested: "revision_requested",
	cancelled: "cancelled",
	timeout: "timeout",
} as const

export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS]
export type PlanResponseStatus =
	| typeof PLAN_STATUS.approved
	| typeof PLAN_STATUS.revisionRequested
	| typeof PLAN_STATUS.cancelled

interface PlanFile {
	path: string
	purpose: string
}

interface PlanDataModel {
	tableName: string
	purpose: string
	fields: string[]
}

interface PlanCardData {
	planId: string
	status: PlanStatus
	title: string
	summary: string
	appType: string
	requirements: string[]
	implementationSteps: string[]
	files: PlanFile[]
	dataModel: PlanDataModel[]
	acceptanceCriteria: string[]
	assumptions: string[]
	response: string
}

export interface PlanActionDetail extends Record<string, unknown> {
	task_id: string
	plan_id: string
	question_id: string
	response_status: PlanResponseStatus
	answer: string
}

function normalizeText(value: unknown) {
	if (typeof value === "string") return value.trim()
	if (value == null) return ""
	return String(value).trim()
}

function tryParseJson(value: string): unknown {
	const text = value.trim()
	if (!text || (text[0] !== "[" && text[0] !== "{")) return undefined
	try {
		return JSON.parse(text)
	} catch {
		return undefined
	}
}

function normalizeListLine(value: string) {
	return value
		.trim()
		.replace(/^[-*]\s+/, "")
		.replace(/^\d+[.)、]\s*/, "")
		.trim()
}

function normalizeStringList(value: unknown): string[] {
	if (typeof value === "string") {
		const parsed = tryParseJson(value)
		if (parsed !== undefined) return normalizeStringList(parsed)
		return value.split(/\r?\n/).map(normalizeListLine).filter(Boolean)
	}
	if (!Array.isArray(value)) return []
	return value.map(normalizeText).filter(Boolean)
}

function toRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {}
	return value as Record<string, unknown>
}

function normalizePlanStatus(value: unknown): PlanStatus {
	if (value === PLAN_STATUS.approved) return PLAN_STATUS.approved
	if (value === PLAN_STATUS.revisionRequested) return PLAN_STATUS.revisionRequested
	if (value === PLAN_STATUS.cancelled) return PLAN_STATUS.cancelled
	if (value === PLAN_STATUS.timeout) return PLAN_STATUS.timeout
	return PLAN_STATUS.pending
}

function normalizeFiles(value: unknown): PlanFile[] {
	if (typeof value === "string") {
		const parsed = tryParseJson(value)
		if (parsed !== undefined) return normalizeFiles(parsed)
		return normalizeStringList(value).map((item) => ({ path: item, purpose: "" }))
	}
	if (!Array.isArray(value)) return []
	return value
		.map((item) => {
			const record = toRecord(item)
			return {
				path: normalizeText(record.path),
				purpose: normalizeText(record.purpose),
			}
		})
		.filter((item) => item.path || item.purpose)
}

function normalizeDataModel(value: unknown): PlanDataModel[] {
	if (typeof value === "string") {
		const parsed = tryParseJson(value)
		if (parsed !== undefined) return normalizeDataModel(parsed)
		return []
	}
	if (!Array.isArray(value)) return []
	return value
		.map((item) => {
			const record = toRecord(item)
			return {
				tableName: normalizeText(record.table_name ?? record.tableName),
				purpose: normalizeText(record.purpose),
				fields: normalizeStringList(record.fields),
			}
		})
		.filter((item) => item.tableName || item.purpose || item.fields.length > 0)
}

function parseArguments(argumentsText: unknown): Record<string, unknown> {
	if (typeof argumentsText !== "string" || !argumentsText) return {}
	try {
		const parsed = JSON.parse(argumentsText)
		return toRecord(parsed)
	} catch {
		return {}
	}
}

export function resolvePlan(tool?: ToolDataLike): PlanCardData {
	const detailData = toRecord(tool?.detail?.data)
	const args = parseArguments(tool?.rawArguments ?? detailData.arguments)
	const source = { ...args, ...detailData }

	return {
		planId: normalizeText(source.plan_id) || normalizeText(tool?.id),
		status: normalizePlanStatus(source.status),
		title: normalizeText(source.title ?? source.plan_title),
		summary: normalizeText(source.summary),
		appType: normalizeText(source.app_type ?? source.appType),
		requirements: normalizeStringList(source.requirements),
		implementationSteps: normalizeStringList(
			source.implementation_steps ?? source.implementationSteps,
		),
		files: normalizeFiles(source.files),
		dataModel: normalizeDataModel(source.data_model ?? source.dataModel),
		acceptanceCriteria: normalizeStringList(
			source.acceptance_criteria ?? source.acceptanceCriteria,
		),
		assumptions: normalizeStringList(source.assumptions),
		response: normalizeText(source.response),
	}
}

export function resolveTaskId(topicId: string, toolId?: string) {
	if (!toolId) return ""
	const messages = superMagicStore.messages.get(topicId) || []
	const relatedMessage = (messages as Array<Record<string, unknown>>).find((item) => {
		const messageNode = superMagicStore.getMessageNode(item.app_message_id as string)
		const toolCalls = (messageNode as { tool_calls?: Array<{ id?: string }> })?.tool_calls
		return Array.isArray(toolCalls) && toolCalls.some((toolCall) => toolCall?.id === toolId)
	})

	const relatedMessageNode = superMagicStore.getMessageNode(
		relatedMessage?.app_message_id as string,
	) as { task_id?: unknown } | undefined
	return typeof relatedMessageNode?.task_id === "string" ? relatedMessageNode.task_id : ""
}
