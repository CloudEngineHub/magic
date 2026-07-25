import {
	hasCurrentDirectoryPrefix,
	isCanvasResourceRootPath,
	isRemoteOrSpecialPath,
	stripPathEdgeSlashes,
} from "@/components/CanvasDesign/runtime/shared/path/canvasResourcePath"
import type { LayerElement } from "@/components/CanvasDesign/runtime/document/types"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import type { DesignData } from "../types"
import type { DesignAttachmentIndex } from "./designAttachmentIndex"
import {
	resolveDesignAttachment,
	toDesignDslPath,
	toWorkspaceRelativeCandidates,
	rewriteLayerElementsToDesignDslPaths,
} from "./designPath"

export interface DesignPathTransitionMigrationContext {
	designProjectBasePath?: string
	flatAttachments?: FileItem[]
	attachmentIndex?: DesignAttachmentIndex | null
}

function isLegacyBareCanvasResourcePath(path: string): boolean {
	const trimmed = path.trim()
	return (
		Boolean(trimmed) &&
		!trimmed.startsWith("/") &&
		!hasCurrentDirectoryPrefix(trimmed) &&
		!isRemoteOrSpecialPath(trimmed) &&
		isCanvasResourceRootPath(trimmed)
	)
}

function areSameWorkspacePath(left: string, right: string): boolean {
	return stripPathEdgeSlashes(left) === stripPathEdgeSlashes(right)
}

/**
 * 过渡期历史裸路径修复。
 *
 * `images/a.png` 在旧 DSL 中可能表示当前画布资源，也可能表示工作区根资源。
 * 仅当附件树能唯一确认它属于当前画布时，才收口为 `./images/a.png`；其它情况
 * 原样保留，避免发布后将工作区资源误写到当前画布目录。
 *
 * 这是历史数据平滑迁移逻辑。所有新建资源仍应直接产出显式 `./images|videos|audios/...`。
 */
export function normalizeDesignPathForTransitionMigration(
	path: string,
	context: DesignPathTransitionMigrationContext,
): string {
	const designProjectBasePath = context.designProjectBasePath?.trim()
	if (!designProjectBasePath) return path

	const attachmentContext = {
		designProjectBasePath,
		flatAttachments: context.flatAttachments,
		attachmentIndex: context.attachmentIndex,
	}

	if (!isLegacyBareCanvasResourcePath(path)) {
		return toDesignDslPath(path, attachmentContext)
	}

	// 附件尚未就绪时不猜测，等后续加载/刷新或用户下一次保存再处理。
	if (!context.flatAttachments?.length && !context.attachmentIndex) return path

	const currentCanvasCandidate = toWorkspaceRelativeCandidates(path, attachmentContext)[0]
	if (!currentCanvasCandidate) return path

	const resolved = resolveDesignAttachment(path, attachmentContext, {
		mode: "legacy-recovery",
	})
	if (
		resolved.status !== "found" ||
		!areSameWorkspacePath(resolved.resolvedPath, currentCanvasCandidate)
	) {
		return path
	}

	return toDesignDslPath(path, attachmentContext)
}

export function rewriteDesignLayerPathsForTransitionMigration(
	elements: LayerElement[] | undefined,
	context: DesignPathTransitionMigrationContext,
): void {
	const designProjectBasePath = context.designProjectBasePath?.trim()
	if (!elements?.length || !designProjectBasePath) return

	rewriteLayerElementsToDesignDslPaths(elements, designProjectBasePath, {
		rewritePath: (path) => normalizeDesignPathForTransitionMigration(path, context),
	})
}

export function migrateLoadedDesignDataPaths(
	designData: DesignData,
	context: DesignPathTransitionMigrationContext,
): void {
	rewriteDesignLayerPathsForTransitionMigration(designData.canvas?.elements, context)
}
