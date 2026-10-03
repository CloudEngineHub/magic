import {
	DetailType,
	type DetailOperationResultListData,
	type OperationResultItem,
	type OperationResultTarget,
} from "../components/Detail/types"

/** 展示位置由类型决定；即使数据损坏，也在原卡片说明，不切换到回放面板。 */
export function isInlineToolDetail(detail: unknown): boolean {
	return isRecord(detail) && detail.type === DetailType.OperationResultList
}

export function getOperationResultListData(
	detail: unknown,
): DetailOperationResultListData | undefined {
	if (!isRecord(detail) || !isInlineToolDetail(detail) || !isRecord(detail.data)) return
	const { items } = detail.data
	if (!Array.isArray(items) || items.length === 0 || !items.every(isOperationResultItem)) return
	return {
		items: items.map((item) => ({
			...item,
			target: isCanvasElementTarget(item.target) ? item.target : undefined,
		})),
	}
}

function isOperationResultItem(
	item: unknown,
): item is Omit<OperationResultItem, "target"> & { target?: unknown } {
	return (
		isRecord(item) &&
		typeof item.label === "string" &&
		(item.kind === "file" || item.kind === "directory" || item.kind === "text") &&
		(item.status === "success" || item.status === "error") &&
		typeof item.message === "string" &&
		(item.description === undefined || typeof item.description === "string")
	)
}

function isCanvasElementTarget(value: unknown): value is OperationResultTarget {
	return (
		isRecord(value) &&
		value.type === "canvas_element" &&
		typeof value.project_path === "string" &&
		value.project_path.length > 0 &&
		typeof value.element_id === "string" &&
		value.element_id.length > 0
	)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value)
}
