import type { EmbedFontInput, UsedFont } from "./api/font"
import type { GeneratedPPTX, ResourceLoadError, SlideConfig } from "./api/options"
import type { ElementNode } from "./ir/dom"
import type { PPTNode } from "./ir/node"
import type { PackagePresentationInput, SerializablePPTNode } from "./ir/serialize"
import type { IconBackup } from "./materialize/pseudo-icon"
import type {
	PrepareSlideNodesInput,
	PrepareSlideNodesResult,
} from "./pipeline/render-slide"
import type {
	SandboxInstance,
	SandboxReadyControllerConstructor,
} from "./sandbox/htmlRenderSandbox"
import type { TextMergeMode } from "./pipeline/text-merge-mode"
import type {
	CreateIncrementalPresentationPackagerInput,
	IncrementalPresentationPackager,
} from "./packaging/incremental-types"

export interface RenderSlideRuntime {
	transformElements?: (
		elements: ElementNode[],
		config: SlideConfig,
		iWindow: Window,
		options?: {
			textMergeMode?: TextMergeMode
			/**
			 * All collected DOM nodes, including nodes filtered from drawing. Text
			 * flow still needs these nodes for visibility and inherited styles.
			 */
			elementNodeMap?: Map<Element, ElementNode>
		},
	) => PPTNode[]
	materializePseudoIcons?: (document: Document, window: Window) => IconBackup[]
	restoreIcons?: (backups: IconBackup[]) => void
	resolveCaptures?: (
		nodes: PPTNode[],
		signal?: AbortSignal,
		onResourceError?: (error: ResourceLoadError) => void,
	) => Promise<void>
	materializeVideoCoverNodes?: (
		nodes: PPTNode[],
		signal?: AbortSignal,
		onResourceError?: (error: ResourceLoadError) => void,
	) => Promise<void>
	materializePptImageNodes?: (
		nodes: PPTNode[],
		signal?: AbortSignal,
		onResourceError?: (error: ResourceLoadError) => void,
	) => Promise<void>
}

export interface ExportPipelineRuntime extends RenderSlideRuntime {
	prepareSlideNodes?: (
		input: PrepareSlideNodesInput,
	) => Promise<PrepareSlideNodesResult>
	detectFontsFromNodes?: (slides: SerializablePPTNode[][]) => UsedFont[]
	packagePresentationInWorker?: (
		input: PackagePresentationInput & {
			signal: AbortSignal
			onResourceError?: (error: ResourceLoadError) => void
			/** False returns an artifact instead of triggering a browser download. */
			download?: boolean
		},
	) => Promise<GeneratedPPTX | void>
	createIncrementalPresentationPackager?: (
		input: CreateIncrementalPresentationPackagerInput,
	) => IncrementalPresentationPackager | null
}

export interface Html2PptxRuntime {
	createSandbox?: (config: SlideConfig) => SandboxInstance
	sandboxReadyController?: SandboxReadyControllerConstructor
	pipeline?: ExportPipelineRuntime
}

export type { EmbedFontInput }
