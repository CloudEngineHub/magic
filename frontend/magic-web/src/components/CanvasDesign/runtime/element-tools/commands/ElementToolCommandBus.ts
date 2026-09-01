import type { Canvas } from "../../core/Canvas"
import {
	getActiveContentId,
	getContentById,
	getContents,
	isContentGenerationPending,
} from "../../document/elementContent"
import type { ElementContentBase, LayerElement } from "../../document/types"
import { isContentVersionOperations } from "../../elements/core/ContentVersionOperations"
import { createStoryboardVideosFromConnection } from "../../interaction/connection/imageVideoBatchCreation"
import { ElementToolTypeEnum } from "../../../public/props"
import type {
	ElementToolCommand,
	ElementToolCommandBus as ElementToolCommandBusContract,
	ElementToolRuntimeState,
	ElementToolType,
} from "../model/ElementToolTypes"

type CommandHandler = (command: ElementToolCommand) => void | Promise<void>
type FallbackCommandHandler = (
	command: ElementToolCommand,
	element: LayerElement | undefined,
) => boolean

const CONTENT_INVOCATION_TOOLS = new Set<ElementToolType>([
	ElementToolTypeEnum.ContentDownload,
	ElementToolTypeEnum.ContentCrop,
	ElementToolTypeEnum.ContentExtend,
	ElementToolTypeEnum.ContentEraser,
	ElementToolTypeEnum.ContentReplace,
	ElementToolTypeEnum.ContentRemoveBackground,
	ElementToolTypeEnum.ContentEnhance,
	ElementToolTypeEnum.ContentPromptExtraction,
	ElementToolTypeEnum.ContentMediaOriginalSize,
	ElementToolTypeEnum.TextFillColor,
	ElementToolTypeEnum.TextFontFamily,
	ElementToolTypeEnum.TextFontStyle,
	ElementToolTypeEnum.TextFontSize,
	ElementToolTypeEnum.TextAlign,
	ElementToolTypeEnum.TextAdvanced,
	ElementToolTypeEnum.TextContentOptimization,
])
const CONTENT_INTERACTION_TOOLS = new Set<ElementToolType>([
	ElementToolTypeEnum.ContentCrop,
	ElementToolTypeEnum.ContentExtend,
	ElementToolTypeEnum.ContentEraser,
])
const GENERATION_TOOLS = new Set<ElementToolType>([
	ElementToolTypeEnum.GenerationQuickEdit,
	ElementToolTypeEnum.GenerationReEdit,
	ElementToolTypeEnum.GenerationGenerateAgain,
])
const VERSION_MUTATION_TOOLS = new Set<ElementToolType>([
	ElementToolTypeEnum.VersionPrevious,
	ElementToolTypeEnum.VersionNext,
	ElementToolTypeEnum.VersionSetMain,
	ElementToolTypeEnum.VersionDelete,
])
const TEXT_FORMATTING_TOOLS = new Set<ElementToolType>([
	ElementToolTypeEnum.TextFillColor,
	ElementToolTypeEnum.TextFontFamily,
	ElementToolTypeEnum.TextFontStyle,
	ElementToolTypeEnum.TextFontSize,
	ElementToolTypeEnum.TextAlign,
	ElementToolTypeEnum.TextAdvanced,
	ElementToolTypeEnum.TextContentOptimization,
])
const SHAPE_TOOLS = new Set<ElementToolType>([
	ElementToolTypeEnum.ShapeStrokeColor,
	ElementToolTypeEnum.ShapeStyle,
])

interface CommandRegistration {
	handler: CommandHandler
	state: ElementToolRuntimeState
	contentId?: string
	operationId?: string
}

function areRuntimeStatesEqual(
	left: ElementToolRuntimeState,
	right: ElementToolRuntimeState,
): boolean {
	return (
		left.available === right.available &&
		left.disabled === right.disabled &&
		left.loading === right.loading &&
		left.disabledReason === right.disabledReason
	)
}

/**
 * Canvas 级工具命令总线。
 *
 * Handler 可以由编辑器会话临时注册，但目标校验永远在总线内完成，避免
 * 版本切换后把点击结果重新路由到新的 active Content。
 */
export class CanvasElementToolCommandBus implements ElementToolCommandBusContract {
	private readonly registrations = new Map<string, CommandRegistration>()
	private readonly listenersByElementId = new Map<string, Set<() => void>>()
	private readonly snapshotsByTarget = new Map<
		string,
		ReadonlyMap<ElementToolType, ElementToolRuntimeState>
	>()
	private readonly pendingNotificationElementIds = new Set<string>()
	private notificationScheduled = false
	private readonly fallbackHandlers: ReadonlyMap<ElementToolType, FallbackCommandHandler>

	public constructor(private readonly canvas: Canvas) {
		this.fallbackHandlers = new Map([
			[ElementToolTypeEnum.ElementResize, this.executeElementCommand.bind(this)],
			[ElementToolTypeEnum.ElementAlign, this.executeActionCommand.bind(this)],
			[ElementToolTypeEnum.ElementDistribute, this.executeActionCommand.bind(this)],
			[ElementToolTypeEnum.FrameCreate, this.executeActionCommand.bind(this)],
			[ElementToolTypeEnum.FrameRemove, this.executeActionCommand.bind(this)],
			[ElementToolTypeEnum.FrameDownload, this.executeActionCommand.bind(this)],
			[
				ElementToolTypeEnum.FrameStoryboardVideoBatch,
				this.executeStoryboardBatchCommand.bind(this),
			],
			[ElementToolTypeEnum.TextDownload, this.executeActionCommand.bind(this)],
			[ElementToolTypeEnum.TextFillColor, this.executeTextCommand.bind(this)],
			[ElementToolTypeEnum.TextFontFamily, this.executeTextCommand.bind(this)],
			[ElementToolTypeEnum.TextFontStyle, this.executeTextCommand.bind(this)],
			[ElementToolTypeEnum.TextFontSize, this.executeTextCommand.bind(this)],
			[ElementToolTypeEnum.TextAlign, this.executeTextCommand.bind(this)],
			[ElementToolTypeEnum.TextAdvanced, this.executeTextCommand.bind(this)],
			[ElementToolTypeEnum.TextContentOptimization, this.executeTextCommand.bind(this)],
			[ElementToolTypeEnum.ShapeStrokeColor, this.executeShapeCommand.bind(this)],
			[ElementToolTypeEnum.ShapeStyle, this.executeShapeCommand.bind(this)],
			[ElementToolTypeEnum.ContentDownload, this.executeActionCommand.bind(this)],
			[ElementToolTypeEnum.ContentCrop, this.executeContentInteractionCommand.bind(this)],
			[ElementToolTypeEnum.ContentExtend, this.executeContentInteractionCommand.bind(this)],
			[ElementToolTypeEnum.ContentEraser, this.executeContentInteractionCommand.bind(this)],
			[ElementToolTypeEnum.ContentReplace, this.executeMediaCommand.bind(this)],
			[
				ElementToolTypeEnum.ContentMediaOriginalSize,
				this.executeMediaOriginalSizeCommand.bind(this),
			],
			[ElementToolTypeEnum.GenerationQuickEdit, this.executeGenerationCommand.bind(this)],
			[ElementToolTypeEnum.GenerationReEdit, this.executeGenerationCommand.bind(this)],
			[ElementToolTypeEnum.GenerationGenerateAgain, this.executeGenerationCommand.bind(this)],
			[ElementToolTypeEnum.VersionPrevious, this.executeVersionCommand.bind(this)],
			[ElementToolTypeEnum.VersionNext, this.executeVersionCommand.bind(this)],
			[ElementToolTypeEnum.VersionSetMain, this.executeVersionCommand.bind(this)],
			[ElementToolTypeEnum.VersionDelete, this.executeVersionCommand.bind(this)],
		])
	}

	public register(
		key: {
			elementId: string
			toolId: ElementToolType
			contentId?: string
			operationId?: string
		},
		handler: CommandHandler,
		state: Omit<ElementToolRuntimeState, "available"> & { available?: boolean } = {},
	): () => void {
		const handlerKey = this.getHandlerKey(key.elementId, key.toolId, key.contentId)
		const nextState = { available: state.available ?? true, ...state }
		const previous = this.registrations.get(handlerKey)
		if (
			previous &&
			previous.contentId === key.contentId &&
			previous.operationId === key.operationId &&
			areRuntimeStatesEqual(previous.state, nextState)
		) {
			// Handler closures are intentionally refreshed without invalidating the
			// external-store snapshot. This prevents a render-only callback change
			// from synchronously notifying React during a layout effect.
			previous.handler = handler
			return () => {
				if (this.registrations.get(handlerKey) !== previous) return
				this.registrations.delete(handlerKey)
				this.notify(key.elementId, key.contentId)
			}
		}

		const registration = {
			handler,
			state: nextState,
			contentId: key.contentId,
			operationId: key.operationId,
		}
		this.registrations.set(handlerKey, registration)
		if (
			!previous ||
			previous.contentId !== registration.contentId ||
			previous.operationId !== registration.operationId ||
			!areRuntimeStatesEqual(previous.state, registration.state)
		) {
			this.notify(key.elementId, key.contentId)
		}
		return () => {
			if (this.registrations.get(handlerKey) !== registration) return
			this.registrations.delete(handlerKey)
			this.notify(key.elementId, key.contentId)
		}
	}

	public getElementToolStates(
		elementId: string,
		contentId?: string,
	): ReadonlyMap<ElementToolType, ElementToolRuntimeState> {
		const snapshotKey = this.getTargetKey(elementId, contentId)
		const cached = this.snapshotsByTarget.get(snapshotKey)
		if (cached) return cached
		const states = new Map<ElementToolType, ElementToolRuntimeState>()
		for (const [key, registration] of this.registrations) {
			if (registration.contentId && registration.contentId !== contentId) continue
			const [registeredElementId, toolId] = key.split("\u0000") as [string, ElementToolType]
			if (registeredElementId === elementId) states.set(toolId, registration.state)
		}
		this.snapshotsByTarget.set(snapshotKey, states)
		return states
	}

	public subscribeElement(
		elementId: string,
		contentId: string | undefined,
		listener: () => void,
	): () => void {
		const subscriptionKey = this.getTargetKey(elementId, contentId)
		const listeners = this.listenersByElementId.get(subscriptionKey) ?? new Set()
		listeners.add(listener)
		this.listenersByElementId.set(subscriptionKey, listeners)
		return () => {
			listeners.delete(listener)
			if (listeners.size === 0) this.listenersByElementId.delete(subscriptionKey)
		}
	}

	public execute(command: ElementToolCommand): Promise<void> | void {
		const element = this.canvas.elementManager.getElementData(command.elementId)
		if (!element) return
		if (command.contentId && !getContentById(element, command.contentId)) return
		if (command.contentId && command.contentRevision !== undefined) {
			const content = getContentById(element, command.contentId) as
				| (ElementContentBase & {
						revision?: string | number
						contentRevision?: string | number
				  })
				| undefined
			const currentRevision = content?.contentRevision ?? content?.revision
			if (currentRevision !== undefined && currentRevision !== command.contentRevision) return
		}
		if (CONTENT_INVOCATION_TOOLS.has(command.toolId)) {
			if (!command.contentId || getActiveContentId(element as never) !== command.contentId)
				return
		}
		if (
			command.generationId &&
			!this.canvas.generationRuntimeManager.isCurrent(
				command.generationId,
				command.elementId,
				command.contentId,
			)
		) {
			return
		}

		const registration =
			this.registrations.get(
				this.getHandlerKey(command.elementId, command.toolId, command.contentId),
			) ?? this.registrations.get(this.getHandlerKey(command.elementId, command.toolId))
		if (registration?.operationId && registration.operationId !== command.operationId) return
		if (
			registration?.state.available &&
			!registration.state.disabled &&
			!registration.state.loading
		) {
			return registration.handler(command)
		}
		// 编辑器会话是短生命周期的：资源尚未准备好、版本切换或生成状态
		// 变化时，具体编辑器可能暂时没有注册 handler。命令仍然要保留其
		// 捕获的 Content 目标，并交给当前元素的编辑器宿主异步接管。
		if (!registration) {
			const fallbackHandler = this.fallbackHandlers.get(command.toolId)
			if (fallbackHandler?.(command, element)) return
		}

		const actionId = this.getUserActionId(command.toolId)
		if (actionId) return this.canvas.userActionRegistry.execute(actionId, command.payload)
	}

	private getHandlerKey(elementId: string, toolId: string, contentId?: string): string {
		return `${elementId}\u0000${toolId}\u0000${contentId ?? ""}`
	}

	private getTargetKey(elementId: string, contentId?: string): string {
		return `${elementId}\u0000${contentId ?? ""}`
	}

	private notify(elementId: string, contentId?: string): void {
		for (const key of [...this.snapshotsByTarget.keys()]) {
			if (
				key === this.getTargetKey(elementId, contentId) ||
				key.startsWith(`${elementId}\u0000`)
			) {
				this.snapshotsByTarget.delete(key)
			}
		}
		this.pendingNotificationElementIds.add(elementId)
		if (this.notificationScheduled) return
		this.notificationScheduled = true
		queueMicrotask(() => {
			this.notificationScheduled = false
			const elementIds = [...this.pendingNotificationElementIds]
			this.pendingNotificationElementIds.clear()
			for (const pendingElementId of elementIds) this.notifyListeners(pendingElementId)
		})
	}

	private notifyListeners(elementId: string): void {
		for (const [key, listeners] of this.listenersByElementId) {
			if (key === this.getTargetKey(elementId) || key.startsWith(`${elementId}\u0000`)) {
				for (const listener of [...listeners]) listener()
			}
		}
	}

	private executeGenerationCommand(
		command: ElementToolCommand,
		element: LayerElement | undefined,
	): boolean {
		if (!GENERATION_TOOLS.has(command.toolId)) {
			return false
		}

		// 生成工具只允许作用于解析时捕获的 active Content。用户在点击前
		// 切换版本时，迟到命令必须丢弃，不能把请求路由到新版本。
		if (!command.contentId || getActiveContentId(element as never) !== command.contentId)
			return true

		if (element?.type === "image") {
			this.canvas.eventEmitter.emit({
				type: "element:image:toolCommand",
				data: {
					elementId: command.elementId,
					contentId: command.contentId,
					toolId: command.toolId,
				},
			})
			return true
		}
		if (element?.type === "video") {
			this.canvas.eventEmitter.emit({
				type: "element:video:toolCommand",
				data: {
					elementId: command.elementId,
					contentId: command.contentId,
					toolId: command.toolId,
				},
			})
			return true
		}
		return true
	}

	private executeTextCommand(
		command: ElementToolCommand,
		element: LayerElement | undefined,
	): boolean {
		if (!TEXT_FORMATTING_TOOLS.has(command.toolId)) return false
		if (element?.type !== "text") return true
		if (!command.contentId || getActiveContentId(element as never) !== command.contentId)
			return true

		const payload =
			command.payload && typeof command.payload === "object"
				? (command.payload as Record<string, unknown>)
				: {}
		const toolbarState = this.canvas.textFormattingManager.getToolbarState()
		if (toolbarState.selectedTextElement?.id !== command.elementId) return true
		if (command.toolId === ElementToolTypeEnum.TextContentOptimization) {
			if (payload.action !== "apply" || !Array.isArray(payload.content)) return true
			this.canvas.elementManager.update(command.elementId, { content: payload.content })
			return true
		}

		const manager = this.canvas.textFormattingManager
		switch (command.toolId) {
			case ElementToolTypeEnum.TextFillColor:
				if (typeof payload.color === "string") manager.setFillColor(payload.color)
				return true
			case ElementToolTypeEnum.TextFontFamily:
				if (typeof payload.fontFamily === "string")
					manager.setFontFamily(payload.fontFamily)
				return true
			case ElementToolTypeEnum.TextFontSize:
				if (typeof payload.fontSize === "number") manager.setFontSize(payload.fontSize)
				return true
			case ElementToolTypeEnum.TextAlign:
				if (typeof payload.textAlign === "string")
					manager.setTextAlign(payload.textAlign as never)
				return true
			case ElementToolTypeEnum.TextFontStyle:
				if (typeof payload.bold === "boolean") manager.setBold(payload.bold)
				if (typeof payload.italic === "boolean") manager.setItalic(payload.italic)
				if (typeof payload.fontWeight === "number")
					manager.setFontWeight(payload.fontWeight)
				return true
			case ElementToolTypeEnum.TextAdvanced:
				if (typeof payload.underline === "boolean") manager.setUnderline(payload.underline)
				if (typeof payload.strikethrough === "boolean")
					manager.setStrikethrough(payload.strikethrough)
				if (typeof payload.lineHeight === "number" || payload.lineHeight === undefined)
					if ("lineHeight" in payload) manager.setLineHeight(payload.lineHeight as never)
				if (
					typeof payload.letterSpacing === "number" ||
					payload.letterSpacing === undefined
				)
					if ("letterSpacing" in payload)
						manager.setLetterSpacing(payload.letterSpacing as never)
				if (typeof payload.listType === "string" || payload.listType === null)
					manager.setListType(payload.listType as never)
				return true
		}
		return true
	}

	private executeShapeCommand(
		command: ElementToolCommand,
		element: LayerElement | undefined,
	): boolean {
		if (!SHAPE_TOOLS.has(command.toolId)) return false
		if (!element || !["rectangle", "ellipse", "triangle", "star"].includes(element.type))
			return true
		const payload =
			command.payload && typeof command.payload === "object"
				? (command.payload as { updates?: Record<string, unknown> })
				: undefined
		if (!payload?.updates || typeof payload.updates !== "object") return true
		const allowedKeys =
			command.toolId === ElementToolTypeEnum.ShapeStrokeColor
				? new Set(["stroke", "strokeWidth", "interactionConfig"])
				: new Set(["cornerRadius", "sides", "opacity", "innerRadiusRatio"])
		const updates = Object.fromEntries(
			Object.entries(payload.updates).filter(([key]) => allowedKeys.has(key)),
		)
		if (Object.keys(updates).length > 0) {
			this.canvas.elementManager.update(command.elementId, updates as never)
		}
		return true
	}

	private executeContentInteractionCommand(
		command: ElementToolCommand,
		element: LayerElement | undefined,
	): boolean {
		if (!CONTENT_INTERACTION_TOOLS.has(command.toolId)) {
			return false
		}
		if (element?.type !== "image") return true
		if (!command.contentId || getActiveContentId(element as never) !== command.contentId)
			return true

		switch (command.toolId) {
			case ElementToolTypeEnum.ContentCrop:
				this.canvas.cropManager.enterCropMode(command.elementId, command.contentId)
				return true
			case ElementToolTypeEnum.ContentExtend:
				this.canvas.extendManager.enterExtendMode(command.elementId, command.contentId)
				return true
			case ElementToolTypeEnum.ContentEraser:
				this.canvas.eraserManager.enterEraserMode(command.elementId, command.contentId)
				return true
		}
		return true
	}

	private executeMediaCommand(
		command: ElementToolCommand,
		element: LayerElement | undefined,
	): boolean {
		if (command.toolId !== ElementToolTypeEnum.ContentReplace) return false
		if (element?.type !== "image" && element?.type !== "video" && element?.type !== "audio") {
			return true
		}
		if (!command.contentId || getActiveContentId(element as never) !== command.contentId)
			return true

		const payload =
			command.payload && typeof command.payload === "object"
				? (command.payload as { anchorElement?: HTMLElement; anchorRect?: DOMRect })
				: undefined
		this.canvas.eventEmitter.emit({
			type: "element:media:replaceClick",
			data: {
				elementId: command.elementId,
				mediaType: element.type,
				contentId: command.contentId,
				...(payload?.anchorElement ? { anchorElement: payload.anchorElement } : {}),
				...(payload?.anchorRect
					? {
							anchorRect: {
								left: payload.anchorRect.left,
								top: payload.anchorRect.top,
								width: payload.anchorRect.width,
								height: payload.anchorRect.height,
							},
						}
					: {}),
			},
		})
		return true
	}

	private executeMediaOriginalSizeCommand(
		command: ElementToolCommand,
		element: LayerElement | undefined,
	): boolean {
		if (command.toolId !== ElementToolTypeEnum.ContentMediaOriginalSize) return false
		if (element?.type !== "image" && element?.type !== "video") return true
		const payload =
			command.payload && typeof command.payload === "object"
				? (command.payload as { width?: number; height?: number })
				: undefined
		if (!payload || payload.width === undefined || payload.height === undefined) return true
		this.canvas.elementManager.update(command.elementId, {
			width: payload.width,
			height: payload.height,
		})
		return true
	}

	private executeVersionCommand(
		command: ElementToolCommand,
		element: LayerElement | undefined,
	): boolean {
		if (!element) return false
		if (!VERSION_MUTATION_TOOLS.has(command.toolId)) {
			return false
		}
		const instance = this.canvas.elementManager.getElementInstance(command.elementId)
		if (!isContentVersionOperations(instance)) return true
		const contents = getContents(element as never)
		const activeContentId = getActiveContentId(element as never)
		if (command.contentId && activeContentId !== command.contentId) return true
		const activeIndex = Math.max(
			0,
			contents.findIndex((content) => content.contentId === activeContentId),
		)
		if (command.contentId && !getContentById(element as never, command.contentId)) return true
		const commandTargetIndex = command.contentId
			? contents.findIndex((content) => content.contentId === command.contentId)
			: activeIndex
		switch (command.toolId) {
			case ElementToolTypeEnum.VersionPrevious:
				if (commandTargetIndex > 0)
					instance.switchActiveContent(contents[commandTargetIndex - 1].contentId)
				return true
			case ElementToolTypeEnum.VersionNext:
				if (commandTargetIndex < contents.length - 1)
					instance.switchActiveContent(contents[commandTargetIndex + 1].contentId)
				return true
			case ElementToolTypeEnum.VersionSetMain:
				if (command.contentId) {
					const target = getContentById(element as never, command.contentId) as
						| (ElementContentBase & { src?: string })
						| undefined
					if (target && !isContentGenerationPending(target) && target.src) {
						instance.setMainContent(command.contentId)
					}
				}
				return true
			case ElementToolTypeEnum.VersionDelete:
				if (
					contents.length > 1 &&
					getActiveContentId(element as never) === command.contentId &&
					!contents.some(isContentGenerationPending)
				) {
					void Promise.resolve(instance.deleteActiveContent())
				}
				return true
		}
		return true
	}

	private getUserActionId(toolId: ElementToolType): string | undefined {
		switch (toolId) {
			case ElementToolTypeEnum.ElementAlign:
				return "align.left"
			case ElementToolTypeEnum.ElementDistribute:
				return "distribute.horizontal"
			case ElementToolTypeEnum.FrameCreate:
				return "frame.create"
			case ElementToolTypeEnum.FrameRemove:
				return "frame.remove"
			case ElementToolTypeEnum.ContentDownload:
				return "download.image"
			case ElementToolTypeEnum.FrameDownload:
				return "download.frame"
			case ElementToolTypeEnum.TextDownload:
				return "download.image"
			case ElementToolTypeEnum.ElementResize:
				return ElementToolTypeEnum.ElementResize
			default:
				return undefined
		}
	}

	private executeActionCommand(
		command: ElementToolCommand,
		_element: LayerElement | undefined,
	): boolean {
		void _element
		const payload =
			command.payload && typeof command.payload === "object"
				? (command.payload as { actionId?: string; [key: string]: unknown })
				: undefined
		const actionId = payload?.actionId ?? this.getUserActionId(command.toolId)
		if (!actionId) return true
		const canExecute = this.canvas.userActionRegistry.canExecute?.(actionId) ?? true
		if (!canExecute) return true
		const actionPayload = { ...(payload ?? {}) }
		delete actionPayload.actionId
		void this.canvas.userActionRegistry.execute(actionId, actionPayload)
		return true
	}

	private executeElementCommand(
		command: ElementToolCommand,
		element: LayerElement | undefined,
	): boolean {
		if (command.toolId !== ElementToolTypeEnum.ElementResize || !element) return false
		const payload =
			command.payload && typeof command.payload === "object"
				? (command.payload as {
						width?: number
						height?: number
						aspectRatioLocked?: boolean
					})
				: undefined
		if (!payload || payload.width === undefined || payload.height === undefined) return true
		this.canvas.elementManager.update(command.elementId, {
			width: payload.width,
			height: payload.height,
			interactionConfig: {
				...element.interactionConfig,
				aspectRatioLocked:
					payload.aspectRatioLocked ?? element.interactionConfig?.aspectRatioLocked,
			},
		})
		return true
	}

	private executeStoryboardBatchCommand(
		command: ElementToolCommand,
		_element: LayerElement | undefined,
	): boolean {
		void _element
		const payload = command.payload as
			| {
					origin?: { kind: "element"; elementId: string; side: "right" }
					videoModelList?: readonly unknown[]
			  }
			| undefined
		if (!payload?.origin || !payload.videoModelList) return true
		void createStoryboardVideosFromConnection({
			canvas: this.canvas,
			origin: payload.origin,
			videoModelList: payload.videoModelList as never,
		})
		return true
	}
}
