import {
	useId,
	useLayoutEffect,
	useState,
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
} from "react"
import MagicDropdown from "@/components/base/MagicDropdown"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import type { AttachmentItem } from "../../hooks/types"
import type { FilePresentation } from "../../utils/file-presentation"
import type { useFileManagerSelection } from "../../hooks/useFileManagerSelection"
import type { useFileManagerGestures } from "../../hooks/useFileManagerGestures"
import type { useFileManagerCommands } from "../../hooks/useFileManagerCommands"
import { FileManagerItem } from "./FileManagerItem"
import type { FileManagerActions, FileManagerLayout, FileManagerView } from "./types"

interface Props {
	viewport: RefObject<HTMLDivElement>
	gestures: ReturnType<typeof useFileManagerGestures>
	directoryId: string
	items: FilePresentation[]
	view: FileManagerView
	selection: ReturnType<typeof useFileManagerSelection>
	initialScrollTop: number
	onScroll: (top: number) => void
	onOpen: (file: AttachmentItem) => void
	onBack: () => void
	onForward: () => void
	onUp: () => void
	isActive: boolean
	loading: boolean
	error: boolean
	onRefresh: () => void
	query: string
	renderTag?: (file: AttachmentItem) => ReactNode
	actions: ReturnType<typeof useFileManagerCommands>
	getPopupContainer: () => HTMLElement | null
}

export function FileManagerContent(props: Props) {
	const { t } = useTranslation("super")
	const viewport = props.viewport
	const [width, setWidth] = useState(0)
	const listId = useId()
	const grid = props.view === "grid"
	const padding = grid ? 18 : 12
	const columns = grid ? Math.max(1, Math.floor((width - padding * 2 + 12) / 116)) : 1
	const layout: FileManagerLayout = {
		columns,
		columnWidth: Math.max(0, (width - padding * 2 + (grid ? 12 : 0)) / columns),
		rowHeight: grid ? 124 : 44,
		itemHeight: grid ? 112 : 43,
		gap: grid ? 12 : 0,
		padding,
	}
	props.gestures.setLayout(layout)
	const virtualizer = useVirtualizer({
		count: Math.ceil(props.items.length / columns),
		getScrollElement: () => viewport.current,
		estimateSize: () => layout.rowHeight,
		paddingStart: padding,
		paddingEnd: 75,
		overscan: 3,
	})
	useLayoutEffect(() => {
		const element = viewport.current
		if (!element) return
		const observer = new ResizeObserver(([entry]) => {
			// 隐藏标签页可能暂时没有宽度；保留上次列数，避免破坏导航保存的滚动位置。
			if (entry.contentRect.width > 0) setWidth(entry.contentRect.width)
		})
		observer.observe(element)
		return () => observer.disconnect()
	}, [viewport])
	useLayoutEffect(() => {
		virtualizer.measure()
	}, [columns, layout.rowHeight, virtualizer])
	const restoreScroll = useMemoizedFn(() => {
		if (viewport.current) viewport.current.scrollTop = props.initialScrollTop
	})
	useLayoutEffect(restoreScroll, [props.directoryId, restoreScroll])
	const selectIndex = (index: number, event: KeyboardEvent<HTMLDivElement>) => {
		const item = props.items[Math.max(0, Math.min(props.items.length - 1, index))]?.item
		if (!item?.file_id) return
		props.selection.select(
			item.file_id,
			event,
			(event.ctrlKey || event.metaKey) && !event.shiftKey,
		)
		virtualizer.scrollToIndex(
			Math.floor(Math.max(0, Math.min(props.items.length - 1, index)) / columns),
			{ align: "auto" },
		)
	}
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!props.isActive || event.nativeEvent.isComposing || event.defaultPrevented) return
		const target = event.target
		if (
			!(target instanceof HTMLElement) ||
			target.closest(
				"input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]",
			)
		)
			return
		const mod = event.metaKey || event.ctrlKey
		const mac = /Mac|iPhone|iPad/.test(navigator.platform)
		const key = event.key.toLowerCase()
		const execute = (command: Parameters<FileManagerActions["execute"]>[0]) => {
			event.preventDefault()
			if (props.actions?.canExecute(command)) props.actions.execute(command)
		}
		if (mod && key === "a") {
			event.preventDefault()
			props.selection.all()
			return
		}
		if (mod && key === "c") return execute("copy")
		if (mod && key === "x") return execute("cut")
		if (mod && key === "v") return execute(mac && event.altKey ? "pasteMove" : "paste")
		if (event.altKey && key === "arrowleft") {
			event.preventDefault()
			props.onBack()
			return
		}
		if (event.altKey && key === "arrowright") {
			event.preventDefault()
			props.onForward()
			return
		}
		if (key === "arrowup" && (mac ? event.metaKey : event.altKey)) {
			event.preventDefault()
			props.onUp()
			return
		}
		if (key === "f2" || (mac && key === "enter")) return execute("rename")
		if (key === "delete" || (mac && event.metaKey && key === "backspace"))
			return execute("trash")
		if (
			key === " " ||
			(!mac && key === "enter") ||
			(mac && event.metaKey && (key === "o" || key === "arrowdown"))
		) {
			event.preventDefault()
			if (props.selection.selectedIds.size === 1) {
				const id = props.selection.selectedIds.values().next().value
				const index = id ? props.selection.positions.get(id) : undefined
				if (index !== undefined) props.onOpen(props.items[index].item)
			}
			return
		}
		if (key === "escape") {
			event.preventDefault()
			if (!props.gestures.cancel() && !props.actions.cancelClipboard())
				props.selection.clear()
			return
		}
		if (event.shiftKey && key === "f10") {
			event.preventDefault()
			const focused = props.selection.focusedId
				? document.getElementById(`${listId}-${props.selection.focusedId}`)
				: viewport.current
			const bounds = focused?.getBoundingClientRect()
			if (focused && bounds)
				focused.dispatchEvent(
					new MouseEvent("contextmenu", {
						bubbles: true,
						clientX: bounds.left + 16,
						clientY: bounds.top + 16,
					}),
				)
			return
		}
		const current = props.selection.focusedId
			? (props.selection.positions.get(props.selection.focusedId) ?? 0)
			: -1
		const offsets: Record<string, number> = {
			arrowleft: -1,
			arrowright: 1,
			arrowup: -columns,
			arrowdown: columns,
		}
		if (key in offsets || key === "home" || key === "end") {
			event.preventDefault()
			selectIndex(
				key === "home"
					? 0
					: key === "end"
						? props.items.length - 1
						: current < 0
							? 0
							: current + offsets[key],
				event,
			)
		}
	}
	return (
		<>
			{!grid && (
				<div
					aria-hidden
					className="grid shrink-0 grid-cols-[minmax(0,1fr)_80px] gap-2 border-b bg-muted/30 px-6 py-1.5 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_80px_170px]"
				>
					<span>{t("fileManager.name")}</span>
					<span>{t("fileManager.type")}</span>
					<span className="hidden sm:block">{t("fileManager.modified")}</span>
				</div>
			)}
			<MagicDropdown
				trigger={["contextMenu"]}
				rootClassName="min-h-0 flex-1"
				menu={{ items: props.actions.getMenuItems() }}
				getPopupContainer={() => props.getPopupContainer() ?? document.body}
			>
				<div
					ref={viewport}
					role="listbox"
					aria-label={t("fileManager.files")}
					aria-multiselectable
					aria-busy={props.loading}
					aria-activedescendant={
						props.selection.focusedId
							? `${listId}-${props.selection.focusedId}`
							: undefined
					}
					tabIndex={props.isActive ? 0 : -1}
					data-manager-target={props.directoryId}
					className="relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
					onKeyDown={onKeyDown}
					onScroll={(event) => props.onScroll(event.currentTarget.scrollTop)}
					onPointerDown={props.gestures.onPointerDown}
					onPointerMove={props.gestures.onPointerMove}
					onPointerUp={props.gestures.onPointerUp}
					onPointerCancel={props.gestures.onPointerCancel}
					onLostPointerCapture={props.gestures.onLostPointerCapture}
					onContextMenuCapture={(event) => {
						if (
							!(event.target instanceof Element) ||
							!event.currentTarget.contains(event.target)
						)
							return
						const id =
							event.target instanceof Element
								? event.target.closest<HTMLElement>("[data-manager-item]")?.dataset
										.managerItem
								: undefined
						if (!id) props.selection.clear()
						else if (!props.selection.selectedIds.has(id))
							props.selection.replace(new Set([id]))
					}}
				>
					{props.error ? (
						<div role="alert" className="p-6 text-center text-sm">
							{t("userSpace.loadFailed")}
							<Button variant="ghost" size="sm" onClick={props.onRefresh}>
								{t("userSpace.retry")}
							</Button>
						</div>
					) : !props.items.length ? (
						<p role="status" className="p-10 text-center text-sm text-muted-foreground">
							{props.loading
								? t("userSpace.loading")
								: props.query
									? t("fileManager.noMatches")
									: t("fileManager.empty")}
						</p>
					) : null}
					<div
						className="relative min-h-full"
						style={{ height: virtualizer.getTotalSize() }}
					>
						{virtualizer.getVirtualItems().map((row) => (
							<div
								key={row.key}
								role="presentation"
								className="absolute left-0 top-0 grid w-full"
								style={{
									transform: `translateY(${row.start}px)`,
									height: layout.itemHeight,
									paddingInline: padding,
									gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
									columnGap: layout.gap,
								}}
							>
								{props.items
									.slice(row.index * columns, (row.index + 1) * columns)
									.map((resource) => (
										<FileManagerItem
											key={resource.item.file_id}
											id={`${listId}-${resource.item.file_id}`}
											presentation={resource}
											view={props.view}
											selected={props.selection.selectedIds.has(
												resource.item.file_id ?? "",
											)}
											focused={
												props.selection.focusedId === resource.item.file_id
											}
											cut={props.actions.cutIds.has(
												resource.item.file_id ?? "",
											)}
											menuItems={props.actions.getMenuItems(resource.item)}
											onSelect={(event) => {
												viewport.current?.focus({ preventScroll: true })
												if (resource.item.file_id)
													props.selection.select(
														resource.item.file_id,
														event,
													)
											}}
											onOpen={() => props.onOpen(resource.item)}
											tag={props.renderTag?.(resource.item)}
											getPopupContainer={props.getPopupContainer}
										/>
									))}
							</div>
						))}
					</div>
					{props.gestures.rectangle && (
						<div
							aria-hidden
							className="pointer-events-none absolute z-10 border border-primary bg-primary/15"
							style={props.gestures.rectangle}
						/>
					)}
				</div>
			</MagicDropdown>
		</>
	)
}
