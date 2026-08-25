import type { ElementToolType } from "../../../public/props"
export type { ElementToolType } from "../../../public/props"
import type { ElementContentBase, LayerElement } from "../../document/types"
import type { ContentState } from "../../document/elementContent"

export type { ContentState } from "../../document/elementContent"

export type ElementToolSurface = "top" | "bottom"

export type ElementToolRenderKind =
	| "top-action"
	| "top-custom"
	| "bottom-action"
	| "bottom-version-controls"

export type ElementToolIcon =
	| "pencil"
	| "square-pen"
	| "rotate-ccw"
	| "loader"
	| "chevron-left"
	| "chevron-right"
	| "crown"
	| "trash"

export type ElementToolScope = "element" | "active-content" | "version-set" | "generation"

export type ElementToolExecution = "command" | "display-only"

export type ElementToolVisibility = "visible" | "hidden" | "disabled"

export type GenerationElementToolId = Extract<ElementToolType, `generation.${string}`>

export interface GenerationToolCommandRequest {
	toolId: GenerationElementToolId
	contentId: string
}

export interface ContentSnapshot extends ElementContentBase {
	readonly src?: string
	readonly status?: string
	readonly [key: string]: unknown
}

export interface GenerationAttemptState {
	readonly attemptId: string
	readonly elementId: string
	readonly contentId?: string
	readonly operation?: string
	readonly phase?: string
}

export interface ElementToolRuntimeState {
	readonly available: boolean
	readonly loading?: boolean
	readonly disabled?: boolean
	readonly disabledReason?: string
}

export interface ElementToolElementSnapshot {
	readonly id: string
	readonly type: LayerElement["type"]
	readonly locked?: boolean
	readonly width?: number
	readonly height?: number
}

export interface ElementToolSession {
	readonly toolId: ElementToolType
	readonly elementId: string
	readonly contentId?: string
	readonly operationId?: string
}

export interface ElementToolContext {
	commandBus?: ElementToolCommandBus
	element: ElementToolElementSnapshot
	selection: {
		readonly elements: readonly ElementToolElementSnapshot[]
		readonly isSingleElement: boolean
		readonly isDragging: boolean
		readonly isSelecting: boolean
		readonly activeToolSession?: ElementToolSession | null
	}
	content: {
		readonly activeContentId?: string
		readonly mainContentId?: string
		readonly active?: ContentSnapshot
		readonly activeResource?: {
			readonly src?: string
			readonly width?: number
			readonly height?: number
		}
		readonly activeRevision?: string | number
		readonly byId: ReadonlyMap<string, ContentSnapshot>
		readonly states: ReadonlyMap<string, ContentState>
	}
	generation: {
		readonly activeContentIsGenerating: boolean
		readonly siblingGeneratingContentIds: readonly string[]
		readonly generatingContentIds: readonly string[]
		readonly attemptsByContentId: ReadonlyMap<string, GenerationAttemptState>
	}
	interaction: {
		readonly isReplacing: boolean
		readonly isDragging: boolean
		readonly isSelecting: boolean
		readonly isEditing: boolean
		readonly isCropping: boolean
		readonly isExtending: boolean
		readonly isErasing: boolean
		readonly isFullscreenPreviewOpen: boolean
	}
	runtime: {
		readonly revision: number
		readonly toolsById: ReadonlyMap<ElementToolType, ElementToolRuntimeState>
	}
	capabilities: {
		readonly canSwitchVersion: boolean
		readonly canSetMainVersion: boolean
		readonly canDeleteVersion: boolean
		readonly canGenerateContent: boolean
		readonly canConcurrentGenerate: boolean
	}
	flags: {
		readonly convertHightSupported: boolean
		readonly showVideoOriginalSize: boolean
		readonly isStoryboardOutputFrame: boolean
	}
}

export interface ElementToolCommand {
	toolId: ElementToolType
	elementId: string
	contentId?: string
	contentRevision?: string | number
	generationId?: string
	operationId?: string
	payload?: unknown
}

export interface ElementToolCommandBus {
	execute(command: ElementToolCommand): Promise<void> | void
}

export interface ElementToolResolution {
	id: ElementToolType
	execution: ElementToolExecution
	surface: ElementToolSurface
	visibility: ElementToolVisibility
	loading?: boolean
	disabledReason?: string
	presentation: ElementToolSurfaceOptions
	data?: {
		version?: {
			current: number
			total: number
			isMain: boolean
		}
	}
	target: ElementToolTarget
	execute?: (payload?: unknown) => void | Promise<void>
}

export interface ElementToolTarget {
	elementId: string
	contentId?: string
	contentRevision?: string | number
	generationId?: string
	operationId?: string
}

export interface ElementToolSurfaceOptions {
	renderKind: ElementToolRenderKind
	group: string
	order: number
	icon?: ElementToolIcon
	labelKey?: string
	labelFallback?: string
	shortcut?: string
}

export interface ElementToolDefinition {
	id: ElementToolType
	scope: ElementToolScope
	execution: ElementToolExecution
	surfaces: Partial<Record<ElementToolSurface, ElementToolSurfaceOptions>>
	isApplicable: (context: ElementToolContext) => boolean
	resolve: (context: ElementToolContext) => ElementToolResolution
}
