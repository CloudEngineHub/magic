import type { Canvas } from "../../../runtime/core/Canvas"
import { ElementTypeEnum } from "../../../runtime/document/types"
import type { LayerElement } from "../../../runtime/document/types"
import type { Rect } from "../../../runtime/shared/ids"
import { isDrawableMinimapRect, mergeMinimapRects } from "./minimapGeometry"

export type MinimapSceneItemKind = "container" | "element"

export interface MinimapSceneItem {
	id: string
	kind: MinimapSceneItemKind
	bounds: Rect
}

export interface MinimapScene {
	items: MinimapSceneItem[]
	itemsById: Map<string, MinimapSceneItem>
	childrenById: Map<string, string[]>
	contentBounds: Rect | null
}

function isContainerType(type: LayerElement["type"]): boolean {
	return type === ElementTypeEnum.Frame || type === ElementTypeEnum.Group
}

/** 展开元素及其可见子树，仅返回小地图中实际可绘制的元素 ID。 */
export function getMinimapSceneSubtreeIds(
	scene: MinimapScene,
	rootIds: readonly string[],
): string[] {
	const result: string[] = []
	const visited = new Set<string>()
	const pending = [...rootIds]

	while (pending.length > 0) {
		const elementId = pending.pop()
		if (!elementId || visited.has(elementId)) continue
		visited.add(elementId)
		if (scene.itemsById.has(elementId)) result.push(elementId)
		const childIds = scene.childrenById.get(elementId)
		if (childIds) pending.push(...childIds)
	}

	return result
}

function expandSceneContentBounds(scene: MinimapScene, bounds: readonly Rect[]): void {
	if (bounds.length === 0) return
	scene.contentBounds = mergeMinimapRects([
		...(scene.contentBounds ? [scene.contentBounds] : []),
		...bounds,
	])
}

/** 采集当前可见元素的绝对几何和父子索引；连接线和媒体资源不进入小地图。 */
export function collectMinimapScene(canvas: Canvas): MinimapScene {
	const containers: MinimapSceneItem[] = []
	const elements: MinimapSceneItem[] = []
	const itemsById = new Map<string, MinimapSceneItem>()
	const childrenById = new Map<string, string[]>()

	const collectElement = (data: LayerElement): void => {
		if (data.visible === false) return

		if ("children" in data && Array.isArray(data.children)) {
			childrenById.set(
				data.id,
				data.children.filter((child) => child.visible !== false).map((child) => child.id),
			)
		}

		const bounds = canvas.geometryCacheManager.getElementBounds(data.id)
		if (isDrawableMinimapRect(bounds)) {
			const item: MinimapSceneItem = {
				id: data.id,
				kind: isContainerType(data.type) ? "container" : "element",
				bounds,
			}
			if (item.kind === "container") {
				containers.push(item)
			} else {
				elements.push(item)
			}
			itemsById.set(item.id, item)
		}

		if ("children" in data && Array.isArray(data.children)) {
			data.children.forEach(collectElement)
		}
	}

	canvas.elementManager.getAllElements().forEach(collectElement)
	const items = [...containers, ...elements]

	return {
		items,
		itemsById,
		childrenById,
		contentBounds: mergeMinimapRects(items.map((item) => item.bounds)),
	}
}

/** 高频拖拽期间按整体位移更新选中元素及其可见子树，不重新读取完整文档树。 */
export function translateMinimapSceneItems(
	scene: MinimapScene,
	rootIds: readonly string[],
	deltaX: number,
	deltaY: number,
	stationaryContentBounds?: Rect | null,
): void {
	if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return
	if (deltaX === 0 && deltaY === 0) return

	const changedBounds: Rect[] = []
	for (const elementId of getMinimapSceneSubtreeIds(scene, rootIds)) {
		const item = scene.itemsById.get(elementId)
		if (!item) continue
		item.bounds.x += deltaX
		item.bounds.y += deltaY
		changedBounds.push(item.bounds)
	}
	if (stationaryContentBounds !== undefined) {
		scene.contentBounds = mergeMinimapRects([
			...(stationaryContentBounds ? [stationaryContentBounds] : []),
			...changedBounds,
		])
	} else {
		expandSceneContentBounds(scene, changedBounds)
	}
}

/** 拖拽开始时计算未参与移动的静态内容范围，后续每帧只需合并当前移动子树。 */
export function getMinimapSceneStationaryBounds(
	scene: MinimapScene,
	rootIds: readonly string[],
): Rect | null {
	const movingIds = new Set(getMinimapSceneSubtreeIds(scene, rootIds))
	return mergeMinimapRects(
		scene.items.filter((item) => !movingIds.has(item.id)).map((item) => item.bounds),
	)
}

/** 缩放、普通拖拽或 rerender 时，仅刷新指定元素及其可见子树的几何。 */
export function refreshMinimapSceneItems(
	canvas: Canvas,
	scene: MinimapScene,
	rootIds: readonly string[],
	stationaryContentBounds?: Rect | null,
): void {
	const changedBounds: Rect[] = []
	for (const elementId of getMinimapSceneSubtreeIds(scene, rootIds)) {
		const item = scene.itemsById.get(elementId)
		if (!item) continue
		const bounds = canvas.geometryCacheManager.getElementBounds(elementId)
		if (!isDrawableMinimapRect(bounds)) continue
		Object.assign(item.bounds, bounds)
		changedBounds.push(item.bounds)
	}
	if (stationaryContentBounds !== undefined) {
		scene.contentBounds = mergeMinimapRects([
			...(stationaryContentBounds ? [stationaryContentBounds] : []),
			...changedBounds,
		])
	} else {
		expandSceneContentBounds(scene, changedBounds)
	}
}
