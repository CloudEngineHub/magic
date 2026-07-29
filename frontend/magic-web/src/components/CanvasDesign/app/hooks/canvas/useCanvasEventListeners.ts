import { useLatest, useDebounceFn } from "ahooks"
import { useCallback, useEffect, useRef } from "react"
import { useCanvas } from "../../providers/CanvasProvider"
import { useCanvasEvents } from "./useCanvasEvent"
import type { CanvasDesignStorageData, CanvasDesignMethods } from "../../../public/magic-types"
import type { Marker, CanvasDocument } from "../../../runtime/document/types"
import type {
	CanvasDesignDataChangeMeta,
	CanvasDesignDataChangeSource,
	CanvasDesignDataPatch,
} from "../../../public/props"
import type { CanvasElementNameChange } from "../../../runtime/core/EventEmitter"

const CANVAS_DATA_CHANGE_DEBOUNCE_MS = 120

interface UseCanvasEventListenersOptions {
	/** 是否为只读模式 */
	readonly?: boolean
	/** Magic 方法 */
	methods?: CanvasDesignMethods
	/** 创建 marker 前的回调 */
	beforeMarkerCreate?: (marker: Marker) => void
	/** marker 创建回调 */
	onMarkerCreated?: (marker: Marker) => void
	/** marker 删除回调 */
	onMarkerDeleted?: (id: string) => void
	/** marker 数据更新回调（仅在更新时触发） */
	onMarkerUpdated?: (marker: Marker, markers: Marker[]) => void
	/** 画布数据变化回调 */
	onCanvasDesignDataChange?: (
		canvasData: CanvasDocument,
		meta?: CanvasDesignDataChangeMeta,
	) => void
	onCanvasDesignDataPatchChange?: (
		patch: CanvasDesignDataPatch,
		meta?: CanvasDesignDataChangeMeta,
	) => void
}

/**
 * 处理所有 Canvas 事件监听
 * 职责：统一管理所有 Canvas 事件的订阅和处理
 */
export function useCanvasEventListeners(options: UseCanvasEventListenersOptions): void {
	const {
		readonly,
		methods,
		beforeMarkerCreate,
		onMarkerCreated,
		onMarkerDeleted,
		onMarkerUpdated,
		onCanvasDesignDataChange,
		onCanvasDesignDataPatchChange,
	} = options

	const { canvas } = useCanvas()

	// 使用 useLatest 保存回调函数引用，避免重复订阅
	const beforeMarkerCreateRef = useLatest(beforeMarkerCreate)
	const onMarkerCreatedRef = useLatest(onMarkerCreated)
	const onMarkerDeletedRef = useLatest(onMarkerDeleted)
	const onMarkerUpdatedRef = useLatest(onMarkerUpdated)
	const onCanvasDesignDataChangeRef = useLatest(onCanvasDesignDataChange)
	const onCanvasDesignDataPatchChangeRef = useLatest(onCanvasDesignDataPatchChange)
	const readonlyRef = useLatest(readonly)
	const pendingCanvasDataChangeMetaRef = useRef<CanvasDesignDataChangeMeta | null>(null)
	const pendingDeletedElementIdsRef = useRef<Set<string>>(new Set())
	const canvasDataChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// 防抖保存 viewport 到 storage
	const { run: saveViewportToStorage } = useDebounceFn(
		() => {
			if (!canvas || !methods?.saveStorage) return
			try {
				const viewport = canvas.exportViewport()
				const existingData = methods.getStorage() || {}
				const storageData: CanvasDesignStorageData = {
					...existingData,
					viewport,
				}
				methods.saveStorage(storageData)
			} catch (error) {
				//
			}
		},
		{ wait: 300 },
	)

	const mergeElementNameChanges = useCallback(
		(
			previousChanges?: CanvasElementNameChange[],
			nextChanges?: CanvasElementNameChange[],
		): CanvasElementNameChange[] | undefined => {
			if (!previousChanges?.length && !nextChanges?.length) return undefined

			const mergedByElementId = new Map<string, CanvasElementNameChange>()
			previousChanges?.forEach((change) => {
				mergedByElementId.set(change.elementId, change)
			})
			nextChanges?.forEach((change) => {
				const previousChange = mergedByElementId.get(change.elementId)
				mergedByElementId.set(change.elementId, {
					...change,
					oldName: previousChange?.oldName ?? change.oldName,
					oldSrc: previousChange?.oldSrc ?? change.oldSrc,
				})
			})

			return Array.from(mergedByElementId.values())
		},
		[],
	)

	const mergePendingCanvasDataChangeMeta = useCallback(
		(
			source: CanvasDesignDataChangeSource,
			changeMeta?: Pick<
				CanvasDesignDataChangeMeta,
				| "changedElementIds"
				| "elementNameChanges"
				| "changedConnectionIds"
				| "deletedConnectionIds"
			>,
		) => {
			const previous = pendingCanvasDataChangeMetaRef.current
			const changedElementIds = changeMeta?.changedElementIds
			let nextChangedElementIds: string[] | undefined
			if (changedElementIds && previous?.changedElementIds) {
				nextChangedElementIds = Array.from(
					new Set([...previous.changedElementIds, ...changedElementIds]),
				)
			} else if (changedElementIds) {
				nextChangedElementIds = changedElementIds
			} else if (previous?.changedElementIds) {
				nextChangedElementIds = previous.changedElementIds
			}
			const mergeIds = (left?: string[], right?: string[]) => {
				if (!left?.length && !right?.length) return undefined
				return Array.from(new Set([...(left ?? []), ...(right ?? [])]))
			}

			pendingCanvasDataChangeMetaRef.current = {
				source,
				changedElementIds: nextChangedElementIds,
				changedConnectionIds: mergeIds(
					previous?.changedConnectionIds,
					changeMeta?.changedConnectionIds,
				),
				deletedConnectionIds: mergeIds(
					previous?.deletedConnectionIds,
					changeMeta?.deletedConnectionIds,
				),
				elementNameChanges: mergeElementNameChanges(
					previous?.elementNameChanges,
					changeMeta?.elementNameChanges,
				),
			}
		},
		[mergeElementNameChanges],
	)

	const flushCanvasDesignDataChange = useCallback(() => {
		if (canvasDataChangeTimerRef.current) {
			clearTimeout(canvasDataChangeTimerRef.current)
			canvasDataChangeTimerRef.current = null
		}

		const meta = pendingCanvasDataChangeMetaRef.current
		pendingCanvasDataChangeMetaRef.current = null
		const deletedElementIds = Array.from(pendingDeletedElementIdsRef.current)
		pendingDeletedElementIdsRef.current.clear()
		if (!canvas || readonlyRef.current) return
		const metaWithDeletedElementIds: CanvasDesignDataChangeMeta | undefined =
			meta || deletedElementIds.length > 0
				? {
						source: meta?.source ?? "element:change",
						changedElementIds: meta?.changedElementIds,
						deletedElementIds,
						changedConnectionIds: meta?.changedConnectionIds,
						deletedConnectionIds: meta?.deletedConnectionIds,
						elementNameChanges: meta?.elementNameChanges,
					}
				: undefined

		const patchHandler = onCanvasDesignDataPatchChangeRef.current
		const changedElementIds = metaWithDeletedElementIds?.changedElementIds
		const changedConnectionIds = metaWithDeletedElementIds?.changedConnectionIds
		const deletedConnectionIds = metaWithDeletedElementIds?.deletedConnectionIds
		const hasElementPatch =
			(changedElementIds && changedElementIds.length > 0) || deletedElementIds.length > 0
		const hasConnectionPatch =
			(changedConnectionIds && changedConnectionIds.length > 0) ||
			(deletedConnectionIds && deletedConnectionIds.length > 0)
		if (
			patchHandler &&
			(hasElementPatch || hasConnectionPatch) &&
			metaWithDeletedElementIds?.source !== "canvas:clear"
		) {
			try {
				const elementPatch = hasElementPatch
					? canvas.elementManager.exportDocumentPatch({
							changedElementIds: changedElementIds ?? [],
							deletedElementIds,
							elementNameChanges: metaWithDeletedElementIds?.elementNameChanges,
							includeTemporary: false,
						})
					: {
							upserts: [],
							deletedElementIds: [],
							changedElementIds: [],
						}
				const connectionPatch = hasConnectionPatch
					? canvas.connectionManager.exportDocumentPatch({
							changedConnectionIds,
							deletedConnectionIds,
						})
					: undefined
				patchHandler(
					{
						...elementPatch,
						...connectionPatch,
					},
					metaWithDeletedElementIds,
				)
				return
			} catch {
				// Patch export is an optimization path; fall back to the legacy full export below.
			}
		}

		if (!onCanvasDesignDataChangeRef.current) return

		// 导出时不包含临时元素，避免保存上传中的图片到外部
		const canvasData = canvas.exportDocument({ includeTemporary: false })
		onCanvasDesignDataChangeRef.current(canvasData, metaWithDeletedElementIds)
	}, [canvas, onCanvasDesignDataChangeRef, onCanvasDesignDataPatchChangeRef, readonlyRef])

	const scheduleCanvasDesignDataChange = useCallback(
		(
			source: CanvasDesignDataChangeSource,
			changeMeta?: Pick<
				CanvasDesignDataChangeMeta,
				| "changedElementIds"
				| "elementNameChanges"
				| "changedConnectionIds"
				| "deletedConnectionIds"
			>,
		) => {
			mergePendingCanvasDataChangeMeta(source, changeMeta)
			if (canvasDataChangeTimerRef.current) {
				clearTimeout(canvasDataChangeTimerRef.current)
			}
			canvasDataChangeTimerRef.current = setTimeout(
				flushCanvasDesignDataChange,
				CANVAS_DATA_CHANGE_DEBOUNCE_MS,
			)
		},
		[flushCanvasDesignDataChange, mergePendingCanvasDataChangeMeta],
	)

	useEffect(() => {
		return () => {
			flushCanvasDesignDataChange()
		}
	}, [flushCanvasDesignDataChange])

	// 监听 marker 创建前事件
	useCanvasEvents(
		["marker:before-create"] as const,
		(event) => {
			if (beforeMarkerCreateRef.current) {
				// 传递 marker 副本作为通知，不修改原始对象
				beforeMarkerCreateRef.current(event.data.marker)
			}
		},
		[canvas],
	)

	// 监听 marker 创建事件
	useCanvasEvents(
		["marker:created"] as const,
		(event) => {
			if (onMarkerCreatedRef.current) {
				onMarkerCreatedRef.current(event.data.marker)
			}
		},
		[canvas],
	)

	// 监听 marker 删除事件
	useCanvasEvents(
		["marker:deleted"] as const,
		(event) => {
			if (onMarkerDeletedRef.current) {
				onMarkerDeletedRef.current(event.data.id)
			}
		},
		[canvas],
	)

	// 监听 marker 数据更新事件（仅在更新时触发）
	useCanvasEvents(
		["marker:updated"] as const,
		(event) => {
			if (!onMarkerUpdatedRef.current || !canvas) return
			// 获取最新的 markers 数组
			const markers = canvas.markerManager.exportMarkers()
			// 调用回调，传递更新的 marker 和最新的 markers 数组
			onMarkerUpdatedRef.current(event.data.marker, markers)
		},
		[canvas],
	)

	// 删除事件本身不保证携带完整变更元信息，先收集到下一次 element:change flush。
	useCanvasEvents(
		["element:deleted"] as const,
		(event) => {
			pendingDeletedElementIdsRef.current.add(event.data.elementId)
		},
		[canvas],
	)

	// 监听所有可能导致画布数据变化的事件
	useCanvasEvents(
		[
			"element:change",
			"canvas:clear",
			"element:temporary:converted",
			"connection:change",
		] as const,
		(changeEvent, clearEvent, temporaryConvertedEvent, connectionEvent) => {
			if (changeEvent) {
				if (changeEvent.data?.phase === "transient") return
				scheduleCanvasDesignDataChange("element:change", {
					changedElementIds: changeEvent.data?.elementIds,
					elementNameChanges: changeEvent.data?.nameChanges,
				})
				return
			}
			if (temporaryConvertedEvent) {
				scheduleCanvasDesignDataChange("element:temporary:converted", {
					changedElementIds: [temporaryConvertedEvent.data.elementId],
				})
				return
			}
			if (clearEvent) {
				scheduleCanvasDesignDataChange("canvas:clear")
				return
			}
			if (connectionEvent) {
				scheduleCanvasDesignDataChange("connection:change", {
					changedConnectionIds: connectionEvent.data.changedConnectionIds,
					deletedConnectionIds: connectionEvent.data.deletedConnectionIds,
				})
			}
		},
		[scheduleCanvasDesignDataChange],
	)

	// 监听 viewport 变化，保存到 storage
	useCanvasEvents(
		["viewport:scale", "viewport:pan"] as const,
		() => {
			saveViewportToStorage()
		},
		[canvas, methods, saveViewportToStorage],
	)
}
