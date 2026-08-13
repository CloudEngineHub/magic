import type Konva from "konva"
import type { Canvas } from "../../core/Canvas"
import {
	getActiveContent,
	getDownstreamContent,
	updateContent,
} from "../../document/elementContent"
import {
	ElementTypeEnum,
	type AudioElementContent,
	type VideoEditElement,
	type VideoEditElementContent,
} from "../../document/types"
import {
	VIDEO_EDIT_ASPECT_RATIOS,
	VIDEO_EDIT_FORMATS,
	VIDEO_EDIT_RESOLUTIONS,
	getVideoEditOutputDimensions,
} from "../../resources/video-composition/VideoCompositionManager"
import {
	StoryboardFieldOverlayHost,
	type StoryboardSelectOption,
} from "../storyboard/StoryboardFieldOverlayHost"
import { VideoEditPlaybackManager } from "./VideoEditPlaybackManager"
import { collectConnectedVideoEditInputs } from "../connection/connectedInputSources"

export type VideoEditControlState = "idle" | "hover" | "pressed" | "disabled" | "editing"

export type VideoEditControlAction =
	| { type: "select-aspect-ratio" }
	| { type: "select-resolution" }
	| { type: "select-format" }
	| { type: "toggle-audio-playback"; disabled?: boolean }
	| { type: "merge-videos"; disabled?: boolean }

export interface VideoEditSelectPresentation {
	fontSize: number
	horizontalPadding: number
	suffixGap: number
	suffixIconSize: number
}

export interface VideoEditControlBindingOptions {
	elementId: string
	node: Konva.Rect
	overlayAnchorNode?: Konva.Node
	selectPresentation?: VideoEditSelectPresentation
	action: VideoEditControlAction
	applyState: (state: VideoEditControlState) => void
}

interface VideoEditControlBinding extends VideoEditControlBindingOptions {
	hovered: boolean
	activationPending: boolean
	lastActivationAt: number
}

const ACTIVATION_DEDUPLICATION_MS = 320

function stopKonvaEvent(event: Konva.KonvaEventObject<Event>): void {
	event.cancelBubble = true
	event.evt?.stopPropagation()
	event.evt?.stopImmediatePropagation()
}

function isCompositionBusy(elementId: string, canvas: Canvas): boolean {
	const snapshot = canvas.videoCompositionManager?.getSnapshot(elementId)
	if (!snapshot) return false
	return ["checking", "preparing", "encoding", "finalizing", "uploading"].includes(
		snapshot.status,
	)
}

/**
 * 视频编辑节点 footer 参数下拉的 Canvas 级交互协调器。
 */
export class VideoEditInteractionManager {
	private readonly canvas: Canvas
	private readonly playbackManager: VideoEditPlaybackManager
	private readonly overlayHost: StoryboardFieldOverlayHost
	private readonly bindings = new Set<VideoEditControlBinding>()
	private activeBinding: VideoEditControlBinding | null = null
	private editingBinding: VideoEditControlBinding | null = null
	private eventUnsubscribers: Array<() => void> = []
	private destroyed = false

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
		this.playbackManager =
			this.canvas.videoEditPlaybackManager ??
			new VideoEditPlaybackManager({ canvas: this.canvas })
		this.overlayHost = new StoryboardFieldOverlayHost({ canvas: this.canvas })
		this.bindCanvasEvents()
	}

	public bindControl(options: VideoEditControlBindingOptions): () => void {
		const binding: VideoEditControlBinding = {
			...options,
			hovered: false,
			activationPending: false,
			lastActivationAt: 0,
		}
		this.bindings.add(binding)

		const handleMouseEnter = () => {
			binding.hovered = true
			if (!this.canvas.deviceInfo.input.hover || !this.isSelectedBinding(binding)) return
			if (this.isDisabled(binding)) {
				binding.applyState("disabled")
				this.canvas.cursorManager.setTemporary("not-allowed")
				return
			}
			if (!this.canActivate(binding)) return
			binding.applyState(this.editingBinding === binding ? "editing" : "hover")
			this.canvas.cursorManager.setTemporary("pointer")
			binding.node.getLayer()?.batchDraw()
		}

		const handleMouseLeave = () => {
			binding.hovered = false
			binding.activationPending = false
			if (this.activeBinding === binding) this.activeBinding = null
			if (this.editingBinding !== binding) {
				binding.applyState(this.isDisabled(binding) ? "disabled" : "idle")
				binding.node.getLayer()?.batchDraw()
			}
			this.restoreCursorIfIdle()
		}

		// 与分镜一致：未选中时不接管事件，把第一次点击留给 SelectionTool；
		// 已选中时必须 stop，避免根 Group 的 draggable 抢走参数下拉手势。
		const tryActivateFromGesture = (): boolean => {
			if (this.isDisabled(binding) && this.isSelectedBinding(binding)) return false
			if (!binding.activationPending || !this.canActivate(binding)) return false
			binding.activationPending = false
			const now = Date.now()
			if (now - binding.lastActivationAt < ACTIVATION_DEDUPLICATION_MS) return false
			binding.lastActivationAt = now
			this.activate(binding)
			return true
		}

		const handlePressStart = (event: Konva.KonvaEventObject<Event>) => {
			const selected = this.isSelectedBinding(binding)
			if (!selected) {
				binding.activationPending = false
				return
			}

			if (this.isDisabled(binding)) {
				stopKonvaEvent(event)
				binding.applyState("disabled")
				this.canvas.cursorManager.setTemporary("not-allowed")
				binding.node.getLayer()?.batchDraw()
				return
			}
			if (this.isMultiTouchEvent(event)) {
				binding.activationPending = false
				return
			}
			if (!this.canActivate(binding)) {
				// 已选中但暂时不可激活时仍阻断拖拽，避免参数区“点到却拖走整卡”。
				stopKonvaEvent(event)
				binding.activationPending = false
				this.applyBindingVisualState(binding)
				binding.node.getLayer()?.batchDraw()
				return
			}

			stopKonvaEvent(event)

			// 同一控件已在编辑：保持打开，只拦截拖拽。
			if (this.editingBinding === binding) {
				binding.activationPending = false
				binding.applyState("editing")
				this.canvas.cursorManager.setTemporary("pointer")
				binding.node.getLayer()?.batchDraw()
				return
			}

			// 切换到另一控件：同一 pointerdown 内 commit 旧 overlay 并打开新的。
			if (this.editingBinding && this.editingBinding !== binding) {
				binding.activationPending = false
				const now = Date.now()
				if (now - binding.lastActivationAt < ACTIVATION_DEDUPLICATION_MS) return
				binding.lastActivationAt = now
				this.activate(binding)
				return
			}

			binding.activationPending = true
			this.activeBinding = binding
			binding.applyState("pressed")
			this.canvas.cursorManager.setTemporary("pointer")
			binding.node.getLayer()?.batchDraw()
		}

		const handlePressEnd = (event: Konva.KonvaEventObject<Event>) => {
			if (this.activeBinding !== binding) return
			stopKonvaEvent(event)
			const cancelled = event.type.includes("cancel") || this.isMultiTouchEvent(event)
			if (cancelled) binding.activationPending = false
			this.activeBinding = null
			if (this.editingBinding === binding) binding.applyState("editing")
			else this.applyBindingVisualState(binding)
			binding.node.getLayer()?.batchDraw()
			this.restoreCursorIfIdle()
			// Radix outside dismiss 常会吞掉后续 click；在 pointerup 补一次激活以支持切换。
			if (!cancelled) tryActivateFromGesture()
		}

		const handleActivate = (event: Konva.KonvaEventObject<Event>) => {
			if (this.isDisabled(binding) && this.isSelectedBinding(binding)) {
				stopKonvaEvent(event)
				return
			}
			if (!binding.activationPending || !this.canActivate(binding)) return
			stopKonvaEvent(event)
			tryActivateFromGesture()
		}

		binding.node.on("mouseenter", handleMouseEnter)
		binding.node.on("mouseleave", handleMouseLeave)
		binding.node.on("pointerdown mousedown touchstart", handlePressStart)
		binding.node.on("pointerup pointercancel mouseup touchend touchcancel", handlePressEnd)
		binding.node.on("click tap", handleActivate)

		binding.applyState(this.isDisabled(binding) ? "disabled" : "idle")

		return () => {
			binding.node.off("mouseenter", handleMouseEnter)
			binding.node.off("mouseleave", handleMouseLeave)
			binding.node.off("pointerdown mousedown touchstart", handlePressStart)
			binding.node.off("pointerup pointercancel mouseup touchend touchcancel", handlePressEnd)
			binding.node.off("click tap", handleActivate)
			this.bindings.delete(binding)
			if (this.activeBinding === binding) this.activeBinding = null
			if (this.editingBinding === binding) {
				this.editingBinding = null
				this.overlayHost.cancel()
			}
		}
	}

	public refreshOutputControlStates(elementId?: string): void {
		this.bindings.forEach((binding) => {
			if (elementId && binding.elementId !== elementId) return
			if (this.editingBinding === binding) return
			if (!binding.node.getStage()) return
			this.applyBindingVisualState(binding)
			binding.node.getLayer()?.batchDraw()
		})
		this.canvas.contentLayer.batchDraw()
		this.restoreCursorIfIdle()
	}

	public destroy(): void {
		this.destroyed = true
		this.resetTransientState({ cancelEditor: true })
		this.eventUnsubscribers.forEach((unsubscribe) => unsubscribe())
		this.eventUnsubscribers = []
		this.bindings.clear()
		this.overlayHost.destroy()
	}

	private bindCanvasEvents(): void {
		const reconcileSelection = () => {
			if (this.editingBinding && !this.isSelectedBinding(this.editingBinding)) {
				this.overlayHost.commit()
			}
			this.resetPressedStates()
		}
		const commitEditor = () => this.overlayHost.commit()
		const cancelEditor = () => this.resetTransientState({ cancelEditor: true })
		const handleElementDeleted = ({ data }: { data: { elementId: string } }) => {
			if (this.editingBinding?.elementId === data.elementId) cancelEditor()
		}

		this.eventUnsubscribers.push(
			this.canvas.eventEmitter.on("element:select", reconcileSelection),
			this.canvas.eventEmitter.on("element:deselect", reconcileSelection),
			this.canvas.eventEmitter.on("canvas:readonly", commitEditor),
			this.canvas.eventEmitter.on("tool:change", commitEditor),
			this.canvas.eventEmitter.on("canvas:devicechange", commitEditor),
			this.canvas.eventEmitter.on("elements:transform:dragstart", commitEditor),
			this.canvas.eventEmitter.on("elements:transform:anchorDragStart", commitEditor),
			this.canvas.eventEmitter.on("viewport:gesture", ({ data }) => {
				if (data.active) cancelEditor()
			}),
			this.canvas.eventEmitter.on("element:deleted", handleElementDeleted),
			this.canvas.eventEmitter.on("element:batchdeleted", cancelEditor),
			this.canvas.eventEmitter.on("canvas:clear", cancelEditor),
		)
	}

	private activate(binding: VideoEditControlBinding): void {
		if (
			binding.action.type === "toggle-audio-playback" ||
			binding.action.type === "merge-videos"
		) {
			this.overlayHost.commit()
		}
		switch (binding.action.type) {
			case "select-aspect-ratio":
				this.openAspectRatioSelect(binding)
				break
			case "select-resolution":
				this.openResolutionSelect(binding)
				break
			case "select-format":
				this.openFormatSelect(binding)
				break
			case "toggle-audio-playback":
				this.toggleAudioPlayback(binding.elementId)
				break
			case "merge-videos":
				this.mergeVideos(binding.elementId)
				break
		}
	}

	private toggleAudioPlayback(elementId: string): void {
		const element = this.getVideoEditElement(elementId)
		if (!element) return
		const audioElementId = collectConnectedVideoEditInputs(
			this.canvas,
			elementId,
		).audioElementId
		if (!audioElementId) return
		const audio = this.canvas.elementManager.getElementData(audioElementId)
		if (!audio || audio.type !== ElementTypeEnum.Audio) return
		const src = getDownstreamContent<AudioElementContent>(audio)?.src
		if (!src) return
		void this.playbackManager.toggle(elementId, { audioElementId, path: src })
	}

	private mergeVideos(elementId: string): void {
		const element = this.getVideoEditElement(elementId)
		if (!element) return
		const content = getActiveContent<VideoEditElementContent>(element)
		const inputs = collectConnectedVideoEditInputs(this.canvas, elementId)
		if (!content || inputs.videoElementIds.length === 0) return
		const resolution = VIDEO_EDIT_RESOLUTIONS.includes(
			content.output?.resolution as (typeof VIDEO_EDIT_RESOLUTIONS)[number],
		)
			? (content.output?.resolution as (typeof VIDEO_EDIT_RESOLUTIONS)[number])
			: "1080P"
		const outputPatch: NonNullable<VideoEditElementContent["output"]> = {
			...(content.output ?? {}),
			resolution,
			format: "mp4",
		}
		if (
			content.output?.aspectRatio &&
			VIDEO_EDIT_ASPECT_RATIOS.includes(
				content.output.aspectRatio as (typeof VIDEO_EDIT_ASPECT_RATIOS)[number],
			)
		) {
			outputPatch.aspectRatio = content.output.aspectRatio
		} else {
			delete outputPatch.aspectRatio
		}
		this.updateOutput(elementId, outputPatch)
		void this.canvas.videoCompositionManager?.start?.(elementId)
	}

	private openAspectRatioSelect(binding: VideoEditControlBinding): void {
		const element = this.getVideoEditElement(binding.elementId)
		if (!element) return
		const content = getActiveContent<VideoEditElementContent>(element)
		const resolution = VIDEO_EDIT_RESOLUTIONS.includes(
			content?.output?.resolution as (typeof VIDEO_EDIT_RESOLUTIONS)[number],
		)
			? (content?.output?.resolution as (typeof VIDEO_EDIT_RESOLUTIONS)[number])
			: "1080P"
		const current =
			content?.output?.aspectRatio &&
			VIDEO_EDIT_ASPECT_RATIOS.includes(
				content.output.aspectRatio as (typeof VIDEO_EDIT_ASPECT_RATIOS)[number],
			)
				? content.output.aspectRatio
				: VIDEO_EDIT_ASPECT_RATIOS[0]
		const options = VIDEO_EDIT_ASPECT_RATIOS.map((value) => {
			const { width, height } = getVideoEditOutputDimensions(value, resolution)
			const ratio = width / height
			const baseSize = 16
			return {
				label: value,
				value,
				secondaryLabel: `${width}x${height}`,
				preview: {
					iconWidth: ratio >= 1 ? baseSize : Math.max(8, Math.round(baseSize * ratio)),
					iconHeight: ratio >= 1 ? Math.max(8, Math.round(baseSize / ratio)) : baseSize,
				},
			}
		})
		this.mountSelect(binding, {
			ariaLabel: this.getText("storyboard.aspectRatio", "画面比例"),
			value: current,
			options,
			onCommit: (value) => this.updateOutput(binding.elementId, { aspectRatio: value }),
		})
	}

	private openResolutionSelect(binding: VideoEditControlBinding): void {
		const element = this.getVideoEditElement(binding.elementId)
		if (!element) return
		const content = getActiveContent<VideoEditElementContent>(element)
		const current = VIDEO_EDIT_RESOLUTIONS.includes(
			content?.output?.resolution as (typeof VIDEO_EDIT_RESOLUTIONS)[number],
		)
			? (content?.output?.resolution as (typeof VIDEO_EDIT_RESOLUTIONS)[number])
			: "1080P"
		const options = VIDEO_EDIT_RESOLUTIONS.map((value) => ({ label: value, value }))
		this.mountSelect(binding, {
			ariaLabel: this.getText("storyboard.resolution", "分辨率"),
			value: current,
			options,
			onCommit: (value) => this.updateOutput(binding.elementId, { resolution: value }),
		})
	}

	private openFormatSelect(binding: VideoEditControlBinding): void {
		const element = this.getVideoEditElement(binding.elementId)
		if (!element) return
		const content = getActiveContent<VideoEditElementContent>(element)
		const current =
			content?.output?.format &&
			VIDEO_EDIT_FORMATS.includes(
				content.output.format as (typeof VIDEO_EDIT_FORMATS)[number],
			)
				? content.output.format
				: VIDEO_EDIT_FORMATS[0]
		const options = VIDEO_EDIT_FORMATS.map((value) => ({
			label: value.toUpperCase(),
			value,
		}))
		this.mountSelect(binding, {
			ariaLabel: this.getText("videoEditNode.format", "格式"),
			value: current,
			options,
			onCommit: (value) => this.updateOutput(binding.elementId, { format: value }),
		})
	}

	private mountSelect(
		binding: VideoEditControlBinding,
		options: {
			ariaLabel: string
			value: string
			options: StoryboardSelectOption[]
			onCommit: (value: string) => void
		},
	): void {
		const anchorNode = binding.overlayAnchorNode
		if (!anchorNode || options.options.length === 0) return
		this.beginEditing(binding)
		this.overlayHost.mount({
			kind: "select",
			anchorNode,
			ariaLabel: options.ariaLabel,
			value: options.value,
			options: options.options,
			fontSize: binding.selectPresentation?.fontSize ?? 12,
			horizontalPadding: binding.selectPresentation?.horizontalPadding ?? 8,
			suffixGap: binding.selectPresentation?.suffixGap ?? 6,
			suffixIconSize: binding.selectPresentation?.suffixIconSize ?? 12,
			borderRadius: 8,
			onCommit: (value) => {
				this.finishEditing(binding)
				options.onCommit(value)
			},
			onCancel: () => this.finishEditing(binding),
			onCanvasOutsidePointer: (point) => this.handleSelectCanvasOutsidePointer(point),
		})
	}

	private handleSelectCanvasOutsidePointer(point: {
		clientX: number
		clientY: number
		target: EventTarget | null
	}): void {
		// 点在当前字段 overlay（含 invisible trigger）上：保持打开。
		if (
			point.target instanceof Element &&
			point.target.closest('[data-canvas-ui="storyboard-field-overlay"]')
		) {
			return
		}
		const nextBinding = this.findBindingAtClientPoint(point.clientX, point.clientY)
		if (nextBinding && nextBinding === this.editingBinding) return

		this.overlayHost.dismissForSwitch()
		if (!nextBinding || !this.canActivate(nextBinding)) return
		const now = Date.now()
		if (now - nextBinding.lastActivationAt < ACTIVATION_DEDUPLICATION_MS) return
		nextBinding.lastActivationAt = now
		this.activate(nextBinding)
	}

	private findBindingAtClientPoint(
		clientX: number,
		clientY: number,
	): VideoEditControlBinding | null {
		const rect = this.canvas.stage.container().getBoundingClientRect()
		const stagePoint = { x: clientX - rect.left, y: clientY - rect.top }
		const shape = this.canvas.stage.getIntersection(stagePoint)
		if (!shape) return null
		for (const binding of this.bindings) {
			let node: Konva.Node | null = shape
			while (node) {
				if (node === binding.node) return binding
				node = node.getParent()
			}
		}
		return null
	}

	private updateOutput(
		elementId: string,
		patch: Partial<NonNullable<VideoEditElementContent["output"]>>,
	): void {
		const element = this.getVideoEditElement(elementId)
		if (!element) return
		const content = getActiveContent<VideoEditElementContent>(element)
		if (!content) return
		const next = updateContent(element, element.activeContentId, {
			output: { ...(content.output ?? {}), ...patch },
		})
		if (next === element) return
		this.canvas.elementManager.update(elementId, { contents: next.contents }, { silent: false })
	}

	private beginEditing(binding: VideoEditControlBinding): void {
		if (this.editingBinding && this.editingBinding !== binding) {
			this.overlayHost.dismissForSwitch()
		}
		this.editingBinding = binding
		binding.applyState("editing")
		binding.node.getLayer()?.batchDraw()
	}

	private finishEditing(binding: VideoEditControlBinding): void {
		if (this.editingBinding === binding) this.editingBinding = null
		if (!binding.node.getStage()) return
		this.applyBindingVisualState(binding)
		binding.node.getLayer()?.batchDraw()
	}

	private canActivate(binding: VideoEditControlBinding): boolean {
		if (this.destroyed || this.isDisabled(binding) || !this.isSelectedBinding(binding)) {
			return false
		}
		const element = this.getVideoEditElement(binding.elementId)
		if (!element || this.canvas.readonly || element.locked) return false
		if (!this.canvas.permissionManager.canUseSelectionToolAffordance()) return false
		return this.hasUsableScreenSize(binding)
	}

	private isSelectedBinding(binding: VideoEditControlBinding): boolean {
		return (
			this.canvas.selectionManager.getSelectionCount() === 1 &&
			this.canvas.selectionManager.isSelected(binding.elementId)
		)
	}

	private hasUsableScreenSize(binding: VideoEditControlBinding): boolean {
		const bounds = binding.node.getAttr("videoEditBaseHitBounds") as
			{ width: number; height: number } | undefined
		if (!bounds) return true
		const scale = binding.node.getAbsoluteScale()
		const screenMinor = Math.min(
			Math.abs(bounds.width * scale.x),
			Math.abs(bounds.height * scale.y),
		)
		const minimum = this.canvas.deviceInfo.input.coarsePointer ? 24 : 18
		return screenMinor >= minimum
	}

	private isDisabled(binding: VideoEditControlBinding): boolean {
		if (
			binding.action.type === "toggle-audio-playback" ||
			binding.action.type === "merge-videos"
		) {
			return Boolean(binding.action.disabled)
		}
		return isCompositionBusy(binding.elementId, this.canvas)
	}

	private resetPressedStates(): void {
		this.activeBinding = null
		this.bindings.forEach((binding) => {
			binding.activationPending = false
			if (!binding.node.getStage() || this.editingBinding === binding) return
			this.applyBindingVisualState(binding)
		})
		this.canvas.contentLayer.batchDraw()
		this.restoreCursorIfIdle()
	}

	private applyBindingVisualState(binding: VideoEditControlBinding): void {
		if (this.isDisabled(binding)) {
			binding.applyState("disabled")
			return
		}
		if (
			binding.hovered &&
			this.canvas.deviceInfo.input.hover &&
			this.isSelectedBinding(binding) &&
			this.canActivate(binding)
		) {
			binding.applyState(this.editingBinding === binding ? "editing" : "hover")
			this.canvas.cursorManager.setTemporary("pointer")
			return
		}
		binding.applyState(this.editingBinding === binding ? "editing" : "idle")
	}

	private resetTransientState(options: { cancelEditor: boolean }): void {
		if (options.cancelEditor) this.overlayHost.cancel()
		this.editingBinding = null
		this.resetPressedStates()
	}

	private restoreCursorIfIdle(): void {
		if (this.activeBinding || Array.from(this.bindings).some((binding) => binding.hovered))
			return
		this.canvas.cursorManager.restoreToolCursor()
	}

	private isMultiTouchEvent(event: Konva.KonvaEventObject<Event>): boolean {
		const nativeEvent = event.evt as Event & { touches?: ArrayLike<unknown> }
		return (nativeEvent.touches?.length ?? 0) > 1
	}

	private getVideoEditElement(elementId: string): VideoEditElement | null {
		const element = this.canvas.elementManager.getElementData(elementId)
		return element?.type === ElementTypeEnum.VideoEdit ? element : null
	}

	private getText(key: string, fallback: string): string {
		return this.canvas.t ? this.canvas.t(key, fallback) : fallback
	}
}
