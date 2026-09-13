import { sidebarStore } from "@/stores/layout/SidebarStore"
import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react"
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"

/** 宽栏、窄栏和最近列表共用虚拟行生命周期；编辑、菜单和原生拖动源必须保持挂载。 */
export function useVirtualProjectList({
	projects,
	rowHeight,
	enabled = true,
	loadEnabled = true,
	scrollKey,
	hasMore = false,
	loading = false,
	error = false,
	onLoadMore,
}: {
	projects: ProjectListItem[]
	rowHeight: number
	enabled?: boolean
	loadEnabled?: boolean
	scrollKey: string
	hasMore?: boolean
	loading?: boolean
	error?: boolean
	onLoadMore?: () => void
}) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const [interactingIds, setInteractingIds] = useState<Set<string>>(new Set())
	const [draggedId, setDraggedId] = useState<string | null>(null)
	const [focusedId, setFocusedId] = useState<string | null>(null)
	const onInteractionChange = useCallback((id: string, active: boolean) => {
		setInteractingIds((previous) => {
			if (previous.has(id) === active) return previous
			const next = new Set(previous)
			if (active) next.add(id)
			else next.delete(id)
			return next
		})
	}, [])
	const virtualizer = useVirtualizer({
		count: projects.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => rowHeight,
		getItemKey: (index) => projects[index].id,
		overscan: 4,
		initialOffset: () => sidebarStore.navigationScrollPositions.get(scrollKey) ?? 0,
		onChange: (instance) => {
			if (instance.scrollElement)
				sidebarStore.navigationScrollPositions.set(scrollKey, instance.scrollOffset ?? 0)
		},
		enabled,
		rangeExtractor: (range) => {
			const indexes = new Set(defaultRangeExtractor(range))
			projects.forEach((project, index) => {
				if (
					interactingIds.has(project.id) ||
					project.id === draggedId ||
					project.id === focusedId
				)
					indexes.add(index)
			})
			return [...indexes].sort((a, b) => a - b)
		},
	})
	const rows = virtualizer.getVirtualItems()
	const lastIndex = rows.at(-1)?.index ?? -1
	useEffect(() => {
		if (
			enabled &&
			loadEnabled &&
			hasMore &&
			!loading &&
			!error &&
			lastIndex >= projects.length - 5
		)
			onLoadMore?.()
	}, [enabled, loadEnabled, hasMore, loading, error, lastIndex, projects.length, onLoadMore])
	useEffect(() => {
		const onDragStart = (event: DragEvent) => {
			const target = event.target instanceof Element ? event.target : null
			if (!target || !scrollRef.current?.contains(target)) return
			setDraggedId(
				target.closest<HTMLElement>("[data-virtual-project-id]")?.dataset
					.virtualProjectId ?? null,
			)
		}
		const clearDrag = () => setDraggedId(null)
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") clearDrag()
		}
		document.addEventListener("dragstart", onDragStart, true)
		document.addEventListener("dragend", clearDrag)
		document.addEventListener("drop", clearDrag)
		document.addEventListener("keydown", onKeyDown)
		document.addEventListener("visibilitychange", clearDrag)
		window.addEventListener("blur", clearDrag)
		return () => {
			document.removeEventListener("dragstart", onDragStart, true)
			document.removeEventListener("dragend", clearDrag)
			document.removeEventListener("drop", clearDrag)
			document.removeEventListener("keydown", onKeyDown)
			document.removeEventListener("visibilitychange", clearDrag)
			window.removeEventListener("blur", clearDrag)
		}
	}, [])
	const onFocusCapture = (event: FocusEvent<HTMLDivElement>) => {
		setFocusedId(
			event.target.closest<HTMLElement>("[data-virtual-project-id]")?.dataset
				.virtualProjectId ?? null,
		)
	}
	const onBlurCapture = (event: FocusEvent<HTMLDivElement>) => {
		if (
			!(event.relatedTarget instanceof Node) ||
			!event.currentTarget.contains(event.relatedTarget)
		)
			setFocusedId(null)
	}
	return {
		scrollRef,
		virtualizer,
		rows,
		onInteractionChange,
		onFocusCapture,
		onBlurCapture,
		hasActiveInteraction: interactingIds.size > 0,
	}
}
