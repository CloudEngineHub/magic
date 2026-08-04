import { ErrorCaptureSource, type ProviderErrorInput } from "../../core/types"

export interface NormalizedVolcengineError {
	error: Error
	attributes: ProviderErrorInput["attributes"] & { syntheticError: boolean }
}

class MagicLoggerSyntheticError extends Error {
	constructor(message: string) {
		super(message)
		// 使用独立名称，便于在探针平台直接识别 Logger 内部合成的异常。
		this.name = "MagicLoggerSyntheticError"
	}
}

export function isProviderErrorInput(value: unknown): value is ProviderErrorInput {
	if (!value || typeof value !== "object") return false

	const candidate = value as Partial<ProviderErrorInput>
	// kind 和关联字段共同构成内部协议标识，避免把直接调用 Provider 的普通对象误识别。
	return (
		candidate.kind === "provider-error-input" &&
		typeof candidate.fallbackMessage === "string" &&
		Boolean(candidate.attributes) &&
		typeof candidate.attributes?.namespace === "string" &&
		typeof candidate.attributes?.eventId === "string" &&
		typeof candidate.attributes?.release === "string"
	)
}

function toSafeMessage(value: unknown, fallbackMessage: string): string {
	if (value instanceof Error && value.message) return value.message
	if (typeof value === "string" && value.trim()) return value
	return fallbackMessage
}

export function normalizeVolcengineError(args: unknown[]): NormalizedVolcengineError {
	const internalInput = args.length === 1 && isProviderErrorInput(args[0]) ? args[0] : undefined
	// 新旧调用都优先复用真实 Error；合成 Error 仅用于满足火山 captureException 的入参要求。
	const originalError = internalInput
		? internalInput.value instanceof Error
			? internalInput.value
			: undefined
		: args.find((value): value is Error => value instanceof Error)
	const value = internalInput?.value ?? originalError ?? args[0]
	const fallbackMessage = toSafeMessage(value, internalInput?.fallbackMessage ?? "Unknown error")

	return {
		error: originalError ?? new MagicLoggerSyntheticError(fallbackMessage),
		attributes: {
			namespace: internalInput?.attributes.namespace ?? "global",
			eventId: internalInput?.attributes.eventId ?? "",
			release: internalInput?.attributes.release ?? "",
			captureSource: internalInput?.attributes.captureSource ?? ErrorCaptureSource.MANUAL,
			eventKey: internalInput?.attributes.eventKey,
			errorKind: internalInput?.attributes.errorKind,
			// 合成堆栈只代表 Provider 调用位置，必须显式标记，不能冒充业务异常堆栈。
			syntheticError: !originalError,
		},
	}
}

export function toVolcengineExtra(
	attributes: NormalizedVolcengineError["attributes"],
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(attributes)
			.filter(([, value]) => value !== undefined && value !== "")
			.map(([key, value]) => [key, String(value)]),
	)
}
