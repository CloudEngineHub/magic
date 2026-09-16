import {
	DetailType,
	type DetailOperationResultData,
	type OperationResultItem,
} from "../components/Detail/types"

/** 展示位置由类型决定；即使数据损坏，也在原卡片说明，不切换到回放面板。 */
export function isInlineToolDetail(detail: unknown): boolean {
	return isRecord(detail) && detail.type === DetailType.OperationResult
}

export function getOperationResultData(detail: unknown): DetailOperationResultData | undefined {
	if (!isRecord(detail) || !isInlineToolDetail(detail) || !isRecord(detail.data)) return
	const { items } = detail.data
	if (!Array.isArray(items) || items.length === 0 || !items.every(isOperationResultItem)) return
	return { items }
}

function isOperationResultItem(item: unknown): item is OperationResultItem {
	return (
		isRecord(item) &&
		typeof item.label === "string" &&
		(item.kind === "file" || item.kind === "directory" || item.kind === "text") &&
		(item.status === "success" || item.status === "error") &&
		typeof item.message === "string" &&
		(item.description === undefined || typeof item.description === "string")
	)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value)
}
