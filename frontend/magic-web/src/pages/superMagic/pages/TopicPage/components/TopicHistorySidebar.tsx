import { useEffect, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { PanelRightOpen } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import { SIDEBAR_COLLAPSED_WIDTH, TOPIC_HISTORY_RESIZE } from "../../../constants/resizablePanel"
import type { TopicDesktopPanelsHistoryLayout } from "./TopicDesktopPanels"
import TopicResizeHandle from "./TopicResizeHandle"

interface TopicHistorySidebarProps {
	layout: TopicDesktopPanelsHistoryLayout
	mode: "full-right" | "fixed" | "drawer" | "hidden"
	width: number
	maxWidth: number
	isFullscreen: boolean
	transition: string
	isDragging: boolean
	collapseProgress: number
	collapseArmed: boolean
	onResizeStart: (clientX: number, mode: "full-right" | "fixed" | "drawer") => void
	isConversationPanelCollapsed: boolean
	onExpandConversationPanel: () => void
}

/** 同一项目只保留一个列表实例；抽屉、固定列和窄条只改变外框，不改变列表挂载位置。 */
export default function TopicHistorySidebar({
	layout,
	mode,
	width,
	maxWidth,
	isFullscreen,
	transition,
	isDragging,
	collapseProgress,
	collapseArmed,
	onResizeStart,
	isConversationPanelCollapsed,
	onExpandConversationPanel,
}: TopicHistorySidebarProps) {
	const { t } = useTranslation("super")
	const closeButtonRef = useRef<HTMLButtonElement>(null)
	const railRef = useRef<HTMLButtonElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)
	const hasOpenedRef = useRef(false)
	const lastWidthRef = useRef<number>(TOPIC_HISTORY_RESIZE.default)
	const lastModeRef = useRef<"full-right" | "fixed" | "drawer">("fixed")
	const previousOpenRef = useRef(layout.isOpen)
	const isVisible = layout.isOpen && !isFullscreen && mode !== "hidden" && width > 0
	if (isVisible) {
		hasOpenedRef.current = true
		lastWidthRef.current = width
		lastModeRef.current = mode
	}
	const isDrawer = isVisible && mode === "drawer"

	useLayoutEffect(() => {
		if (contentRef.current) contentRef.current.inert = !isVisible
		if (previousOpenRef.current !== layout.isOpen) {
			if (layout.isOpen) closeButtonRef.current?.focus()
			else railRef.current?.focus()
		}
		previousOpenRef.current = layout.isOpen
	}, [isVisible, layout.isOpen])

	useEffect(() => {
		if (!isDrawer) return
		closeButtonRef.current?.focus()
	}, [isDrawer])

	return createPortal(
		<div
			className={cn("pointer-events-none fixed inset-0", isDrawer ? "z-50" : "z-40")}
			style={{ visibility: isFullscreen ? "hidden" : undefined }}
		>
			{isDrawer && (
				<div
					className="pointer-events-auto absolute inset-0 bg-transparent"
					data-testid="topic-history-panel-dismiss-area"
					onClick={layout.onClose}
					aria-hidden="true"
				/>
			)}
			<div
				className="pointer-events-auto absolute bottom-[var(--safe-area-inset-bottom)] right-[var(--safe-area-inset-right)] top-[var(--safe-area-inset-top)]"
				style={{
					width: layout.isOpen ? width : SIDEBAR_COLLAPSED_WIDTH,
					transition,
					overflow: layout.isOpen ? "visible" : "hidden",
				}}
			>
				{!layout.isOpen && (
					<button
						ref={railRef}
						type="button"
						className="absolute inset-0 z-10 flex w-6 items-start justify-center rounded border border-border bg-background pt-3 hover:bg-fill"
						aria-label={t("sidebarPanels.expandHistory")}
						onClick={layout.onToggle}
					>
						<PanelRightOpen size={16} />
					</button>
				)}
				<div
					ref={contentRef}
					aria-hidden={!isVisible}
					className="flex h-full min-h-0"
					style={{
						width: isVisible ? width : lastWidthRef.current,
						visibility: isVisible ? "visible" : "hidden",
					}}
				>
					{hasOpenedRef.current && (
						<>
							<TopicResizeHandle
								className="h-full shrink-0"
								dragging={isDragging}
								disabled={!isVisible || maxWidth < TOPIC_HISTORY_RESIZE.min}
								onResizeStart={(clientX) =>
									onResizeStart(clientX, lastModeRef.current)
								}
								collapseProgress={collapseProgress}
								collapseArmed={collapseArmed}
							/>
							<section
								className={cn(
									"flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border bg-background",
									isDrawer && "shadow-2xl",
								)}
								role={isDrawer ? "dialog" : "complementary"}
								data-testid={
									isDrawer
										? "topic-history-panel-drawer"
										: "topic-history-panel-fixed"
								}
							>
								{layout.renderPanel({
									mode: lastModeRef.current,
									onClose: layout.onClose,
									onCollapse: layout.onClose,
									isPanelVisible: isVisible,
									closeButtonRef,
									isConversationPanelCollapsed,
									onExpandConversationPanel,
								})}
							</section>
						</>
					)}
				</div>
			</div>
		</div>,
		document.body,
	)
}
