import type { ToolDataLike } from "@/pages/superMagic/components/MessageList/components/Nodes/ToolCall/tools/DefaultTool"
import { superMagicStore } from "@/pages/superMagic/stores"
import { parsePartialJson } from "./partialJson"

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

export interface PlanDataModelFieldDetail {
	label: string
	value: string
}

export interface PlanDataModelField {
	name: string
	type: string
	description: string
	text: string
	details: PlanDataModelFieldDetail[]
}

const DATA_MODEL_FIELD_KNOWN_KEYS = new Set([
	"name",
	"field_name",
	"fieldName",
	"field",
	"key",
	"label",
	"title",
	"type",
	"field_type",
	"fieldType",
	"data_type",
	"dataType",
	"description",
	"purpose",
	"comment",
	"note",
])

interface PlanDataModel {
	tableName: string
	purpose: string
	fields: PlanDataModelField[]
}

interface PlanCardData {
	planId: string
	status: PlanStatus
	isComplete: boolean
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

function decodePythonString(value: string): string {
	let result = ""
	for (let index = 0; index < value.length; index += 1) {
		const character = value[index]
		if (character !== "\\" || index === value.length - 1) {
			result += character
			continue
		}

		const escaped = value[index + 1]
		index += 1
		if (escaped === "n") result += "\n"
		else if (escaped === "r") result += "\r"
		else if (escaped === "t") result += "\t"
		else if (escaped === "b") result += "\b"
		else if (escaped === "f") result += "\f"
		else if (escaped === "u" && /^[0-9a-fA-F]{4}$/.test(value.slice(index + 1, index + 5))) {
			result += String.fromCharCode(Number.parseInt(value.slice(index + 1, index + 5), 16))
			index += 4
		} else if (escaped === "x" && /^[0-9a-fA-F]{2}$/.test(value.slice(index + 1, index + 3))) {
			result += String.fromCharCode(Number.parseInt(value.slice(index + 1, index + 3), 16))
			index += 2
		} else if (escaped === "\\" || escaped === "'" || escaped === '"') {
			result += escaped
		} else {
			result += `\\${escaped}`
		}
	}
	return result
}

function hasPythonTokenAt(value: string, index: number, token: string): boolean {
	if (!value.startsWith(token, index)) return false
	const previous = value[index - 1] || ""
	const next = value[index + token.length] || ""
	return !/[\w]/.test(previous) && !/[\w]/.test(next)
}

function tryParsePythonLiteral(value: string): unknown {
	// 已完成的旧消息可能包含 Python str(dict)；这里只转换字面量，不执行其中的代码。
	const text = value.trim()
	if (!text || (text[0] !== "[" && text[0] !== "{")) return undefined

	let jsonText = ""
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index]
		if (character === "'" || character === '"') {
			const quote = character
			let rawString = ""
			let closed = false
			for (index += 1; index < text.length; index += 1) {
				const current = text[index]
				if (current === "\\" && index + 1 < text.length) {
					rawString += current + text[index + 1]
					index += 1
					continue
				}
				if (current === quote) {
					closed = true
					break
				}
				rawString += current
			}
			if (!closed) return undefined
			jsonText += JSON.stringify(decodePythonString(rawString))
			continue
		}

		if (hasPythonTokenAt(text, index, "True")) {
			jsonText += "true"
			index += 3
		} else if (hasPythonTokenAt(text, index, "False")) {
			jsonText += "false"
			index += 4
		} else if (hasPythonTokenAt(text, index, "None")) {
			jsonText += "null"
			index += 3
		} else {
			jsonText += character
		}
	}

	try {
		return JSON.parse(jsonText)
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

function normalizeDetailValue(value: unknown): string {
	if (typeof value === "string") return value.trim()
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
		return String(value)
	}
	if (Array.isArray(value)) {
		return value.map(normalizeDetailValue).filter(Boolean).join("、")
	}
	if (!value || typeof value !== "object") return ""

	return Object.entries(value as Record<string, unknown>)
		.map(([key, nestedValue]) => {
			const text = normalizeDetailValue(nestedValue)
			return text ? `${key}: ${text}` : ""
		})
		.filter(Boolean)
		.join("；")
}

function normalizeDataModelField(value: unknown): PlanDataModelField | null {
	if (typeof value === "string") {
		const parsed = tryParseJson(value) ?? tryParsePythonLiteral(value)
		if (parsed !== undefined) return normalizeDataModelField(parsed)
	}

	if (!value || typeof value !== "object" || Array.isArray(value)) {
		const text = normalizeDetailValue(value)
		return text ? { name: "", type: "", description: "", text, details: [] } : null
	}

	const record = value as Record<string, unknown>
	const technicalName = normalizeDetailValue(
		record.key ?? record.field_name ?? record.fieldName ?? record.field,
	)
	const displayName = normalizeDetailValue(record.name ?? record.label ?? record.title)
	const name = technicalName || displayName
	const type = normalizeDetailValue(
		record.type ?? record.field_type ?? record.fieldType ?? record.data_type ?? record.dataType,
	)
	const description =
		normalizeDetailValue(
			record.description ?? record.purpose ?? record.comment ?? record.note,
		) || (technicalName ? displayName : "")
	const details = Object.entries(record)
		.filter(([key]) => !DATA_MODEL_FIELD_KNOWN_KEYS.has(key))
		.map(([detailLabel, detailValue]) => ({
			label: detailLabel,
			value: normalizeDetailValue(detailValue),
		}))
		.filter((detail) => detail.value)

	if (!name && !type && !description && details.length === 0) return null

	return {
		name,
		type,
		description,
		text: "",
		details,
	}
}

function normalizeDataModelFields(value: unknown): PlanDataModelField[] {
	if (typeof value === "string") {
		const parsed = tryParseJson(value) ?? tryParsePythonLiteral(value)
		if (parsed !== undefined) return normalizeDataModelFields(parsed)
		return value
			.split(/\r?\n/)
			.map(normalizeListLine)
			.filter(Boolean)
			.map((text) => ({ name: "", type: "", description: "", text, details: [] }))
	}
	if (!Array.isArray(value)) return []
	return value
		.map(normalizeDataModelField)
		.filter((field): field is PlanDataModelField => field !== null)
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
				fields: normalizeDataModelFields(record.fields),
			}
		})
		.filter((item) => item.tableName || item.purpose || item.fields.length > 0)
}

function parseArguments(argumentsText: unknown) {
	if (typeof argumentsText !== "string" || !argumentsText) {
		return { data: {}, isComplete: false }
	}

	const result = parsePartialJson(argumentsText)
	const isObject =
		!!result.value && typeof result.value === "object" && !Array.isArray(result.value)
	return {
		data: toRecord(result.value),
		isComplete: result.isComplete && isObject,
	}
}

export function resolvePlan(tool?: ToolDataLike): PlanCardData {
	const detailData = toRecord(tool?.detail?.data)
	const argumentsResult = parseArguments(tool?.rawArguments ?? detailData.arguments)
	const source = { ...argumentsResult.data, ...detailData }
	const hasDetail = typeof detailData.status === "string"

	return {
		planId: normalizeText(source.plan_id) || normalizeText(tool?.id),
		status: normalizePlanStatus(source.status),
		isComplete: hasDetail || argumentsResult.isComplete,
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
	const getMessageNode = (item?: Record<string, unknown>) => {
		if (!item) return undefined
		// Assistant 消息以 super_message_id 作为统一身份；app_message_id 仅用于兼容历史消息。
		const messageIds = [item.super_message_id, item.app_message_id].filter(
			(messageId): messageId is string => typeof messageId === "string" && !!messageId,
		)
		for (const messageId of messageIds) {
			const messageNode = superMagicStore.getMessageNode(messageId)
			if (messageNode) return messageNode
		}
		return undefined
	}
	const relatedMessage = (messages as Array<Record<string, unknown>>).find((item) => {
		const messageNode = getMessageNode(item)
		const toolCalls = (messageNode as { tool_calls?: Array<{ id?: string }> })?.tool_calls
		return Array.isArray(toolCalls) && toolCalls.some((toolCall) => toolCall?.id === toolId)
	})

	const relatedMessageNode = getMessageNode(relatedMessage) as { task_id?: unknown } | undefined
	const taskId = relatedMessageNode?.task_id ?? relatedMessage?.task_id
	return typeof taskId === "string" ? taskId : ""
}
