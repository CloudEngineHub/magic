import { isPlainObject } from "lodash-es"
import {
	ErrorCaptureSource,
	normalizeError,
	type ProviderErrorInput,
} from "../../../packages/logger/src"

export { ErrorCaptureSource }

export interface StructuredErrorInput {
	eventKey: string
	errorKind: string
	error?: unknown
	message?: string
	context?: Record<string, unknown>
}

export interface SerializedError {
	name: string
	message: string
	stack?: string
}

export interface ErrorReport {
	namespace: string
	eventKey: string
	errorKind: string
	error: SerializedError
	message?: string
	context?: Record<string, unknown>
	captureSource: ErrorCaptureSource
	eventId: string
	release: string
	syntheticError: boolean
}

export type ParsedErrorCall =
	| { kind: "legacy"; args: unknown[] }
	| { kind: "structured"; input: StructuredErrorInput }
	| { kind: "invalid-structured"; input: Record<string, unknown> }

export function parseErrorCall(data: unknown): ParsedErrorCall {
	const args = Array.isArray(data) ? data : [data]

	// 仅单对象调用可能是新协议，多参数和 Error 等历史写法必须原样走 legacy 链路。
	if (args.length !== 1 || !isPlainObject(args[0])) {
		return { kind: "legacy", args }
	}

	const input = args[0] as Record<string, unknown>
	// eventKey/errorKind 是结构化协议保留字段，普通业务对象不能被误判为异常协议。
	const hasReservedField = "eventKey" in input || "errorKind" in input

	if (!hasReservedField) {
		return { kind: "legacy", args }
	}

	if (
		typeof input.eventKey !== "string" ||
		!input.eventKey.trim() ||
		typeof input.errorKind !== "string" ||
		!input.errorKind.trim()
	) {
		return { kind: "invalid-structured", input }
	}

	return { kind: "structured", input: input as unknown as StructuredErrorInput }
}

export function serializeError(error: Error): SerializedError {
	// Error 的关键属性不可枚举，显式序列化后才能进入自建 /log-report 请求体。
	return {
		name: error.name,
		message: error.message,
		stack: error.stack,
	} satisfies SerializedError
}

export function createErrorReport(
	input: StructuredErrorInput,
	namespace: string,
	eventId: string,
	release: string,
	captureSource: ErrorCaptureSource = ErrorCaptureSource.MANUAL,
): ErrorReport {
	const normalizedError = normalizeError(
		input.error ?? input.message,
		input.message || input.eventKey,
	)

	return {
		namespace,
		eventKey: input.eventKey,
		errorKind: input.errorKind,
		error: serializeError(normalizedError.error),
		message: input.message,
		context: input.context,
		captureSource,
		eventId,
		release,
		syntheticError: normalizedError.syntheticError,
	}
}

function toSafeMessage(value: unknown, fallbackMessage: string): string {
	if (value instanceof Error && value.message) return value.message
	if (typeof value === "string" && value.trim()) return value
	return fallbackMessage
}

export function createProviderErrorInput(
	parsed: Exclude<ParsedErrorCall, { kind: "invalid-structured" }>,
	namespace: string,
	eventId: string,
	release: string,
	captureSource: ErrorCaptureSource = ErrorCaptureSource.MANUAL,
): ProviderErrorInput {
	if (parsed.kind === "structured") {
		return {
			kind: "provider-error-input",
			value: parsed.input.error ?? parsed.input.message,
			fallbackMessage: parsed.input.message || parsed.input.eventKey,
			attributes: {
				namespace,
				eventId,
				eventKey: parsed.input.eventKey,
				errorKind: parsed.input.errorKind,
				release,
				captureSource,
			},
		}
	}

	// legacy 调用可能把 Error 放在任意参数位，优先保留真实对象供 APM 获取原始堆栈。
	const originalError = parsed.args.find((value) => value instanceof Error)
	const value = originalError ?? parsed.args[0]

	return {
		kind: "provider-error-input",
		value,
		fallbackMessage: toSafeMessage(value, "Unknown error"),
		attributes: { namespace, eventId, release, captureSource },
	}
}
