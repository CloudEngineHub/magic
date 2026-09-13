import { makeAutoObservable } from "mobx"
import {
	DEFAULT_MAX_WIDTH,
	PROJECT_SIDER_PANEL_STORAGE_KEY,
	TOPIC_HISTORY_RESIZE,
	DEFAULT_MIN_WIDTH,
	DEFAULT_WIDTH,
	LOW_RESOLUTION_VIEWPORT_WIDTH_PX,
	MESSAGE_PANEL_WIDTH_STORAGE_KEY,
	PROJECT_SIDER_WIDTH_STORAGE_KEY,
} from "../../../constants/resizablePanel"

type DragType = "project" | "message" | "history" | null

interface ConversationPanelState {
	collapsed?: boolean
	lastExpandedSize?: number | null
}

interface TopicLayoutStoreOptions {
	/** Controls whether the conversation collapse state is shared across page mounts. */
	persistConversationPanelState?: boolean
	bufferedMessageCollapse?: boolean
	allowConversationPanelResize?: boolean
}

export interface HistoryDragResult {
	width: number
}
// 到最窄后先容忍轻微越界；继续拉动才反馈意图，达到阈值且松手才收起。
const SIDEBAR_COLLAPSE_BUFFER = { quietDistance: 32, threshold: 128, disarmRatio: 0.75 } as const

const CONVERSATION_PANEL_STORAGE_KEY = "supermagic-topic-conversation-panel"

export class TopicLayoutStore {
	projectSiderWidthPx: number = DEFAULT_WIDTH.PROJECT_SIDER
	messagePanelWidthPx: number = DEFAULT_WIDTH.MESSAGE_PANEL
	isConversationPanelCollapsed = false
	lastExpandedMessagePanelWidthPx: number | null = null
	isDraggingProjectSider = false
	isDraggingMessagePanel = false
	containerWidthPx = 0
	isProjectSiderCollapsed = false
	lastExpandedProjectSiderWidthPx = DEFAULT_WIDTH.PROJECT_SIDER
	isDraggingHistoryPanel = false
	historyDragWidthPx: number = TOPIC_HISTORY_RESIZE.default
	collapseProgress = 0
	isCollapseArmed = false
	private bufferedProjectDrag = false
	private dragStartHistoryWidthPx = 0
	private historyPreferredWidthPx = 0
	private historyDragPointerX = 0
	private historyMaxWidthPx: number = TOPIC_HISTORY_RESIZE.max

	readonly COLLAPSED_MESSAGE_PANEL_WIDTH = 24
	readonly COLLAPSE_TRIGGER_SIZE_EPSILON = 0.2
	readonly COLLAPSE_TRIGGER_DRAG_DISTANCE_RATIO = 1

	private activeDrag: DragType = null
	private dragStartX = 0
	private dragStartProjectSiderWidthPx = 0
	private dragStartMessagePanelWidthPx = 0
	private minSizeReachedPointerX: number | null = null
	private minSizeReachedPanelWidthPx: number | null = null
	private readonly persistConversationPanelState: boolean
	private readonly bufferedMessageCollapse: boolean
	private allowConversationPanelResize: boolean

	/** Creates one layout state container with optional conversation-state persistence. */
	constructor({
		persistConversationPanelState = true,
		bufferedMessageCollapse = false,
		allowConversationPanelResize = true,
	}: TopicLayoutStoreOptions = {}) {
		this.persistConversationPanelState = persistConversationPanelState
		this.bufferedMessageCollapse = bufferedMessageCollapse
		this.allowConversationPanelResize = allowConversationPanelResize
		makeAutoObservable(this, {}, { autoBind: true })
		this.initFromStorage()
		if (!allowConversationPanelResize) this.isConversationPanelCollapsed = false
	}

	setConversationPanelResizeAllowed(allowed: boolean) {
		this.allowConversationPanelResize = allowed
		if (allowed) return
		if (this.activeDrag === "message") this.cancelDrag()
		// 预览隐藏后消息成为唯一主内容，不能保留一个可被迟到 pointerup 提交的收起意图。
		this.isConversationPanelCollapsed = false
	}

	initFromStorage() {
		this.projectSiderWidthPx = this.loadValidPixelWidth({
			storageKey: PROJECT_SIDER_WIDTH_STORAGE_KEY,
			defaultWidth: this.getInitialPanelWidth({
				defaultWidth: DEFAULT_WIDTH.PROJECT_SIDER,
				minWidth: DEFAULT_MIN_WIDTH.PROJECT_SIDER,
			}),
			minWidth: DEFAULT_MIN_WIDTH.PROJECT_SIDER,
			maxWidth: DEFAULT_MAX_WIDTH.PROJECT_SIDER,
		})
		this.messagePanelWidthPx = this.loadValidPixelWidth({
			storageKey: MESSAGE_PANEL_WIDTH_STORAGE_KEY,
			defaultWidth: this.getInitialPanelWidth({
				defaultWidth: DEFAULT_WIDTH.MESSAGE_PANEL,
				minWidth: DEFAULT_MIN_WIDTH.MESSAGE_PANEL,
			}),
			minWidth: DEFAULT_MIN_WIDTH.MESSAGE_PANEL,
			maxWidth: DEFAULT_MAX_WIDTH.MESSAGE_PANEL,
		})
		try {
			const saved = JSON.parse(
				localStorage.getItem(PROJECT_SIDER_PANEL_STORAGE_KEY) || "null",
			) as ConversationPanelState | null
			this.isProjectSiderCollapsed = saved?.collapsed === true
			this.lastExpandedProjectSiderWidthPx =
				typeof saved?.lastExpandedSize === "number" &&
				Number.isFinite(saved.lastExpandedSize)
					? this.clampProjectWidth(saved.lastExpandedSize)
					: this.projectSiderWidthPx
		} catch {
			this.lastExpandedProjectSiderWidthPx = this.projectSiderWidthPx
		}
		if (this.persistConversationPanelState) {
			this.loadConversationPanelState()
		}
	}

	setContainerWidth(width: number) {
		if (!Number.isFinite(width) || width <= 0) return
		this.containerWidthPx = width
	}

	startDragProjectSider(clientX: number, buffered = false) {
		if (!Number.isFinite(clientX)) return
		this.bufferedProjectDrag = buffered
		this.activeDrag = "project"
		this.isDraggingProjectSider = true
		this.dragStartX = clientX
		this.dragStartProjectSiderWidthPx = this.projectSiderWidthPx
	}

	startDragMessagePanel(clientX: number) {
		if (
			!Number.isFinite(clientX) ||
			this.isConversationPanelCollapsed ||
			!this.allowConversationPanelResize
		)
			return
		this.activeDrag = "message"
		this.isDraggingMessagePanel = true
		this.dragStartX = clientX
		this.dragStartMessagePanelWidthPx = this.messagePanelWidthPx
		this.minSizeReachedPointerX = null
		this.minSizeReachedPanelWidthPx = null
	}

	updateDrag(clientX: number) {
		if (!Number.isFinite(clientX)) return

		if (this.activeDrag === "project") {
			const deltaX = clientX - this.dragStartX
			const rawWidth = this.dragStartProjectSiderWidthPx + deltaX
			this.projectSiderWidthPx = this.clampProjectWidth(rawWidth)
			if (this.bufferedProjectDrag)
				this.updateCollapseIntent(rawWidth, DEFAULT_MIN_WIDTH.PROJECT_SIDER)
			return
		}

		if (this.activeDrag === "history") {
			this.historyDragPointerX = clientX
			const rawWidth = this.dragStartHistoryWidthPx - (clientX - this.dragStartX)
			this.historyDragWidthPx = Math.max(
				TOPIC_HISTORY_RESIZE.min,
				Math.min(this.historyMaxWidthPx, rawWidth),
			)
			return
		}

		if (
			this.activeDrag !== "message" ||
			this.isConversationPanelCollapsed ||
			!this.allowConversationPanelResize
		) {
			return
		}

		const deltaX = clientX - this.dragStartX
		const rawWidth = this.dragStartMessagePanelWidthPx - deltaX
		const nextWidth = this.clampMessageWidth(rawWidth)
		this.messagePanelWidthPx = nextWidth
		if (this.bufferedMessageCollapse) {
			this.updateCollapseIntent(rawWidth, DEFAULT_MIN_WIDTH.MESSAGE_PANEL)
			return
		}

		const minWidth = DEFAULT_MIN_WIDTH.MESSAGE_PANEL
		if (nextWidth <= minWidth + this.COLLAPSE_TRIGGER_SIZE_EPSILON) {
			if (this.minSizeReachedPointerX === null) {
				this.minSizeReachedPointerX = clientX
				this.minSizeReachedPanelWidthPx = nextWidth
				return
			}

			if (
				this.minSizeReachedPointerX !== null &&
				this.minSizeReachedPanelWidthPx !== null &&
				this.shouldAutoCollapseByDragDistance(
					clientX - this.minSizeReachedPointerX,
					this.minSizeReachedPanelWidthPx,
				)
			) {
				this.collapseConversationPanel()
				this.clearDragState()
			}
			return
		}

		this.minSizeReachedPointerX = null
		this.minSizeReachedPanelWidthPx = null
		this.lastExpandedMessagePanelWidthPx = nextWidth
	}

	startDragHistoryPanel(
		clientX: number,
		width: number,
		preferredWidth: number,
		maxWidth: number,
	) {
		if (!Number.isFinite(clientX)) return
		this.activeDrag = "history"
		this.isDraggingHistoryPanel = true
		this.dragStartX = clientX
		this.historyDragPointerX = clientX
		this.dragStartHistoryWidthPx = width
		this.historyPreferredWidthPx = preferredWidth
		this.historyDragWidthPx = width
		this.historyMaxWidthPx = maxWidth
	}

	private updateCollapseIntent(rawWidth: number, minWidth: number) {
		// 内容停在最小宽度；越界距离只表达意图，松开才提交收起。
		const { threshold, quietDistance } = SIDEBAR_COLLAPSE_BUFFER
		const overshoot = Math.max(0, minWidth - rawWidth)
		this.collapseProgress = Math.max(
			0,
			Math.min(1, (overshoot - quietDistance) / (threshold - quietDistance)),
		)
		if (overshoot >= threshold) this.isCollapseArmed = true
		else if (overshoot < threshold * SIDEBAR_COLLAPSE_BUFFER.disarmRatio)
			this.isCollapseArmed = false
	}

	collapseProjectSider() {
		if (this.isProjectSiderCollapsed) return
		this.lastExpandedProjectSiderWidthPx = this.projectSiderWidthPx
		this.isProjectSiderCollapsed = true
		this.saveProjectPanelState()
	}

	expandProjectSider() {
		this.projectSiderWidthPx = this.clampProjectWidth(this.lastExpandedProjectSiderWidthPx)
		this.isProjectSiderCollapsed = false
		this.saveProjectPanelState()
	}

	private saveProjectPanelState() {
		try {
			localStorage.setItem(
				PROJECT_SIDER_PANEL_STORAGE_KEY,
				JSON.stringify({
					collapsed: this.isProjectSiderCollapsed,
					lastExpandedSize: this.lastExpandedProjectSiderWidthPx,
				}),
			)
			this.saveWidth(PROJECT_SIDER_WIDTH_STORAGE_KEY, this.projectSiderWidthPx)
		} catch (error) {
			console.error("Failed to save project panel state:", error)
		}
	}

	endDrag(): HistoryDragResult | undefined {
		if (this.activeDrag === "history") {
			// 仅点击手柄时，不把窗口限制后的显示宽度覆盖为用户的新偏好。
			const result = {
				width:
					this.historyDragPointerX === this.dragStartX
						? this.historyPreferredWidthPx
						: this.historyDragWidthPx,
			}
			this.clearDragState()
			return result
		}
		if (this.activeDrag === "project" && this.bufferedProjectDrag && this.isCollapseArmed) {
			this.projectSiderWidthPx = this.dragStartProjectSiderWidthPx
			this.collapseProjectSider()
		}
		if (
			this.activeDrag === "message" &&
			this.bufferedMessageCollapse &&
			this.allowConversationPanelResize
		) {
			if (this.isCollapseArmed) {
				this.messagePanelWidthPx = this.dragStartMessagePanelWidthPx
				this.lastExpandedMessagePanelWidthPx = this.dragStartMessagePanelWidthPx
				this.collapseConversationPanel()
			} else this.lastExpandedMessagePanelWidthPx = this.messagePanelWidthPx
		}
		if (!this.isDraggingProjectSider && !this.isDraggingMessagePanel) {
			return
		}

		this.persistWidths()
		this.saveConversationPanelState()
		this.clearDragState()
	}

	cancelDrag() {
		if (this.activeDrag === "project" && this.bufferedProjectDrag)
			this.projectSiderWidthPx = this.dragStartProjectSiderWidthPx
		if (this.activeDrag === "history") this.historyDragWidthPx = this.dragStartHistoryWidthPx
		if (this.activeDrag === "message" && this.bufferedMessageCollapse)
			this.messagePanelWidthPx = this.dragStartMessagePanelWidthPx
		// Browser-cancelled gestures should stop resizing without committing transient widths.
		this.clearDragState()
	}

	toggleConversationPanel() {
		if (this.isConversationPanelCollapsed) {
			this.expandConversationPanel()
			return
		}
		this.collapseConversationPanel()
	}

	expandConversationPanel() {
		const target = this.clampMessageWidth(
			this.lastExpandedMessagePanelWidthPx ?? this.messagePanelWidthPx,
		)
		this.messagePanelWidthPx = target
		this.isConversationPanelCollapsed = false
		this.saveConversationPanelState()
		this.persistWidths()
	}

	collapseConversationPanel() {
		if (!this.allowConversationPanelResize) return
		if (!this.isConversationPanelCollapsed) {
			if (
				this.messagePanelWidthPx >
				DEFAULT_MIN_WIDTH.MESSAGE_PANEL + this.COLLAPSE_TRIGGER_SIZE_EPSILON
			) {
				this.lastExpandedMessagePanelWidthPx = this.messagePanelWidthPx
			}
			this.isConversationPanelCollapsed = true
			this.saveConversationPanelState()
		}
	}

	ensureExpandedWhenDetailVisible(shouldShowDetailPanel: boolean) {
		if (shouldShowDetailPanel && this.isConversationPanelCollapsed) {
			this.expandConversationPanel()
		}
	}

	private persistWidths() {
		this.saveWidth(PROJECT_SIDER_WIDTH_STORAGE_KEY, this.projectSiderWidthPx)
		this.saveWidth(MESSAGE_PANEL_WIDTH_STORAGE_KEY, this.messagePanelWidthPx)
	}

	private loadValidPixelWidth({
		storageKey,
		defaultWidth,
		minWidth,
		maxWidth,
	}: {
		storageKey: string
		defaultWidth: number
		minWidth: number
		maxWidth: number
	}) {
		try {
			const savedValue = localStorage.getItem(storageKey)
			if (!savedValue) return defaultWidth
			const width = Number(savedValue)
			if (!Number.isFinite(width)) return defaultWidth
			// Ignore legacy percentage values and only accept valid pixel values.
			if (width < minWidth || width > maxWidth || width <= 100) return defaultWidth
			return width
		} catch (error) {
			console.error(`Failed to load panel width (${storageKey}):`, error)
			return defaultWidth
		}
	}

	/**
	 * Apply compact defaults only for first-time layouts. Persisted widths remain the
	 * user's explicit preference and are restored by loadValidPixelWidth above.
	 */
	private getInitialPanelWidth({
		defaultWidth,
		minWidth,
	}: {
		defaultWidth: number
		minWidth: number
	}) {
		if (typeof window === "undefined") return defaultWidth
		return window.innerWidth <= LOW_RESOLUTION_VIEWPORT_WIDTH_PX ? minWidth : defaultWidth
	}

	private saveWidth(storageKey: string, width: number) {
		try {
			localStorage.setItem(storageKey, String(Math.round(width)))
		} catch (error) {
			console.error(`Failed to persist panel width (${storageKey}):`, error)
		}
	}

	private loadConversationPanelState() {
		try {
			const saved = localStorage.getItem(CONVERSATION_PANEL_STORAGE_KEY)
			if (!saved) return

			const parsed = JSON.parse(saved) as ConversationPanelState
			this.isConversationPanelCollapsed = Boolean(parsed.collapsed)
			if (
				typeof parsed.lastExpandedSize === "number" &&
				Number.isFinite(parsed.lastExpandedSize)
			) {
				this.lastExpandedMessagePanelWidthPx = this.clampMessageWidth(
					parsed.lastExpandedSize,
				)
			}
		} catch (error) {
			console.error("Failed to load conversation panel state:", error)
		}
	}

	private saveConversationPanelState() {
		if (!this.persistConversationPanelState) return
		try {
			localStorage.setItem(
				CONVERSATION_PANEL_STORAGE_KEY,
				JSON.stringify({
					collapsed: this.isConversationPanelCollapsed,
					lastExpandedSize: this.lastExpandedMessagePanelWidthPx,
				}),
			)
		} catch (error) {
			console.error("Failed to save conversation panel state:", error)
		}
	}

	private clampProjectWidth(width: number) {
		return Math.max(
			DEFAULT_MIN_WIDTH.PROJECT_SIDER,
			Math.min(DEFAULT_MAX_WIDTH.PROJECT_SIDER, width),
		)
	}

	private clampMessageWidth(width: number) {
		return Math.max(
			DEFAULT_MIN_WIDTH.MESSAGE_PANEL,
			Math.min(DEFAULT_MAX_WIDTH.MESSAGE_PANEL, width),
		)
	}

	private getAutoCollapseDragDistance(panelWidthPx: number) {
		if (!Number.isFinite(panelWidthPx) || panelWidthPx <= 0) return 0
		return panelWidthPx * this.COLLAPSE_TRIGGER_DRAG_DISTANCE_RATIO
	}

	private shouldAutoCollapseByDragDistance(dragDistancePx: number, panelWidthPx: number) {
		return dragDistancePx >= this.getAutoCollapseDragDistance(panelWidthPx)
	}

	private clearDragState() {
		this.isDraggingHistoryPanel = false
		this.collapseProgress = 0
		this.isCollapseArmed = false
		this.activeDrag = null
		this.isDraggingProjectSider = false
		this.isDraggingMessagePanel = false
		this.minSizeReachedPointerX = null
		this.minSizeReachedPanelWidthPx = null
	}
}
