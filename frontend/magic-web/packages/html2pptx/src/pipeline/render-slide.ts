import type { SlideConfig } from "../api/options"
import type { ResourceLoadError } from "../api/options"
import type { PPTNode } from "../ir/node"
import type { SandboxInstance } from "../sandbox/htmlRenderSandbox"
import { log, LogLevel } from "../logger"
import { collectElements, filterRenderable, sortByZOrder } from "../collector"
import { transformElements } from "../transform"
import {
	materializePptImageNodes,
	materializeVideoCoverNodes,
	resolveCaptures,
	materializePseudoIcons,
	restoreIcons,
} from "../materialize"
import type { RenderSlideRuntime } from "../runtime"
import { ensureNotAborted } from "./abort-guard"
import { extractBodyBackground } from "./slide-background"
import { DEFAULT_TEXT_MERGE_MODE, type TextMergeMode } from "./text-merge-mode"

export interface PrepareSlideNodesInput {
	config: SlideConfig
	html: string
	sandbox: SandboxInstance
	signal: AbortSignal
	onResourceError?: (error: ResourceLoadError) => void
	textMergeMode?: TextMergeMode
	runtime?: RenderSlideRuntime
}

export interface PrepareSlideNodesResult {
	pptNodes: PPTNode[]
	/** Measured content width in px */
	totalWidth: number
	/** Measured content height in px, used to determine whether pagination is needed */
	totalHeight: number
	/** body/html background color (hex without #), used as the PPT slide background */
	bodyBackground: string | null
}

/**
 * Single-page pre-render stage:
 * render HTML -> materialize icons -> collect -> filter -> sort -> transform -> prepare
 *
 * Returned `pptNodes` coordinates are already in inches, based on a 1:1 mapping at 96 DPI,
 * and can be further split into multiple PPT pages by sliceByPageHeight.
 */
export async function prepareSlideNodes({
	config,
	html,
	sandbox,
	signal,
	onResourceError,
	textMergeMode = DEFAULT_TEXT_MERGE_MODE,
	runtime,
}: PrepareSlideNodesInput): Promise<PrepareSlideNodesResult> {
	ensureNotAborted(signal)
	const { iWindow, iDocument, totalWidth, totalHeight } = await sandbox.render(html, {
		signal,
		onResourceError,
	})
	ensureNotAborted(signal)

	const bodyBackground = extractBodyBackground(iDocument, iWindow)
	const activeMaterializePseudoIcons = runtime?.materializePseudoIcons ?? materializePseudoIcons
	const activeRestoreIcons = runtime?.restoreIcons ?? restoreIcons
	const activeTransformElements = runtime?.transformElements ?? transformElements
	const activeResolveCaptures = runtime?.resolveCaptures ?? resolveCaptures
	const activeMaterializeVideoCoverNodes =
		runtime?.materializeVideoCoverNodes ?? materializeVideoCoverNodes
	const activeMaterializePptImageNodes =
		runtime?.materializePptImageNodes ?? materializePptImageNodes
	const iconBackups = activeMaterializePseudoIcons(iDocument, iWindow)

	try {
		const elements = collectElements(iDocument, iWindow)
		log(LogLevel.L2, `收集到 ${elements.length} 个元素`)

		const renderableElements = filterRenderable(elements)
		log(LogLevel.L2, `过滤后 ${renderableElements.length} 个可绘制元素`)

		const sortedElements = sortByZOrder(renderableElements)

		const pptNodes = activeTransformElements(sortedElements, config, iWindow, {
			textMergeMode,
			elementNodeMap: new Map(elements.map((element) => [element.element, element])),
		})
		log(LogLevel.L2, `转换为 ${pptNodes.length} 个绘制节点`, {
			totalWidth,
			totalHeight,
		})

		ensureNotAborted(signal)
		await activeResolveCaptures(pptNodes, signal)
		await activeMaterializeVideoCoverNodes(pptNodes, signal, onResourceError)
		await activeMaterializePptImageNodes(pptNodes, signal, onResourceError)
		return { pptNodes, totalWidth, totalHeight, bodyBackground }
	} catch (error) {
		throw error
	} finally {
		activeRestoreIcons(iconBackups)
	}
}
