interface RestoreCheckItem {
	resource_id: string
	conflict?: { type?: string }
}

interface RestoreCheckResponse {
	items_need_move?: RestoreCheckItem[]
	items_no_need_move?: RestoreCheckItem[]
	items_with_conflict?: RestoreCheckItem[]
	items_no_conflict?: RestoreCheckItem[]
}

function toResourceIds(items: RestoreCheckItem[]): string[] {
	return items.map((item) => String(item.resource_id))
}

/** 非文件资源同时兼容回收站父级检查的新旧响应字段。 */
export function parseNonFileRestoreCheck(response: RestoreCheckResponse) {
	const legacyNeedMove = Array.isArray(response.items_need_move) ? response.items_need_move : []
	const legacyNoNeedMove = Array.isArray(response.items_no_need_move)
		? response.items_no_need_move
		: []
	const conflictItems = Array.isArray(response.items_with_conflict)
		? response.items_with_conflict
		: []
	const noConflictItems = Array.isArray(response.items_no_conflict)
		? response.items_no_conflict
		: []

	return {
		needMoveResourceIds: toResourceIds(
			legacyNeedMove.length > 0
				? legacyNeedMove
				: conflictItems.filter((item) => item.conflict?.type === "parent_missing"),
		),
		noNeedMoveResourceIds: toResourceIds(
			legacyNoNeedMove.length > 0 ? legacyNoNeedMove : noConflictItems,
		),
	}
}
