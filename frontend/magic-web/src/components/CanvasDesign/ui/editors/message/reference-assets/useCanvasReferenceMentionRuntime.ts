import { useCallback, useEffect, useMemo, useRef } from "react"
import { useCanvasDesignI18n } from "../../../../app/providers/I18nProvider"
import { useMagic } from "../../../../app/providers/MagicProvider"
import { useOptionalCanvas } from "../../../../app/providers/CanvasProvider"
import type {
	MentionDataServicePort,
	ProjectAttachmentMentionNode,
	ReferenceResourcePanelCatalogBehavior,
	ReferenceResourcePanelInitialLoadOptions,
	ReferenceResourcePanelLimitInfo,
	ReferenceResourcePanelNavigationItem,
	ReferenceResourcePanelSelectableItem,
} from "../../../../public/props"
import type {
	ReferenceAssetPerTypeLimits,
	ReferenceAssetTypeCounts,
	ReferenceResourceFileInfo,
	ReferenceResourceTypeFilter,
} from "./reference-resource.types"
import {
	CANVAS_REFERENCE_MENTION_ITEM_TYPE,
	CANVAS_REFERENCE_MENTION_PANEL_STATE,
} from "./canvasReferenceMention.constants"

interface UseCanvasReferenceMentionRuntimeOptions {
	maxReferenceFiles?: number
	currentReferenceFiles?: string[]
	isReferenceFileLimitReached?: boolean
	referenceResourceType: ReferenceResourceTypeFilter
	referenceFileInfos: ReferenceResourceFileInfo[]
	assetLimits?: ReferenceAssetPerTypeLimits
	currentAssetCounts?: ReferenceAssetTypeCounts
}

export function canSelectCanvasReferenceMentionItem(
	item: ReferenceResourcePanelSelectableItem,
): boolean {
	return item.type !== CANVAS_REFERENCE_MENTION_ITEM_TYPE.folder
}

export const canvasReferenceMentionCatalogBehavior: ReferenceResourcePanelCatalogBehavior = {
	shouldEnterFolderDirectly: ({ selectedItem, enterFolder }) => {
		return Boolean(
			!enterFolder &&
			selectedItem.type === CANVAS_REFERENCE_MENTION_ITEM_TYPE.folder &&
			selectedItem.isFolder,
		)
	},
	getDynamicTransition: ({ selectedItem, enterFolder }) => {
		if (selectedItem.type !== CANVAS_REFERENCE_MENTION_ITEM_TYPE.folder) return null
		if (!enterFolder || !selectedItem.isFolder) return null

		return {
			state: CANVAS_REFERENCE_MENTION_PANEL_STATE.folder,
		}
	},
}

// Single source of truth for Canvas reference resources. Keep both inline "@"
// mentions and the "select from project" popover wired through this runtime so
// default-folder, filtering, limit, and folder-navigation rules cannot drift.
export function useCanvasReferenceMentionRuntime(
	options: UseCanvasReferenceMentionRuntimeOptions,
): {
	dataService?: MentionDataServicePort
	projectAttachmentMentionTree: ProjectAttachmentMentionNode[]
	projectFilesPathPrefix: string
	mentionFileSubtitleParentPrefix?: string
	initialLoadOptions?: ReferenceResourcePanelInitialLoadOptions
	initialNavigationStack?: ReferenceResourcePanelNavigationItem[]
	getInitialLoadOptions: () => ReferenceResourcePanelInitialLoadOptions | undefined
	getInitialNavigationStack: () => ReferenceResourcePanelNavigationItem[] | undefined
	catalogBehavior: ReferenceResourcePanelCatalogBehavior
	canSelectItem: typeof canSelectCanvasReferenceMentionItem
} {
	const {
		projectAttachmentMentionTree = [],
		defaultProjectAttachmentFolderId,
		defaultProjectAttachmentFolderName,
		mentionDataServiceCtor,
	} = useMagic()
	const canvas = useOptionalCanvas()
	const { t } = useCanvasDesignI18n()
	const {
		maxReferenceFiles,
		currentReferenceFiles = [],
		isReferenceFileLimitReached = false,
		referenceResourceType,
		referenceFileInfos,
		assetLimits,
		currentAssetCounts,
	} = options

	const projectFilesPathPrefix = t("referenceAssets.projectFilesRoot", "当前项目文件")
	const mentionFileSubtitleParentPrefix = defaultProjectAttachmentFolderName?.trim() || undefined

	const limitInfoRef = useRef<ReferenceResourcePanelLimitInfo>({
		maxReferenceFiles,
		currentReferenceFiles,
		isReferenceFileLimitReached,
		referenceResourceType,
		referenceFileInfos,
		assetLimits,
		currentAssetCounts,
		projectFilesPathPrefix,
		mentionFileSubtitleParentPrefix,
	})

	limitInfoRef.current = {
		maxReferenceFiles,
		currentReferenceFiles,
		isReferenceFileLimitReached,
		referenceResourceType,
		referenceFileInfos,
		assetLimits,
		currentAssetCounts,
		projectFilesPathPrefix,
		mentionFileSubtitleParentPrefix,
	}

	// DataService 实例稳定，附件树和限制信息通过 sync/ref 更新，避免 TipTap 扩展重建导致失焦。
	const attachmentTreeRef = useRef(projectAttachmentMentionTree)
	attachmentTreeRef.current = projectAttachmentMentionTree

	const dataService = useMemo(() => {
		if (!mentionDataServiceCtor) return undefined
		const service = new mentionDataServiceCtor(attachmentTreeRef.current)
		service.setLimitInfoGetter?.(() => limitInfoRef.current)
		return service
	}, [mentionDataServiceCtor])

	useEffect(() => {
		dataService?.syncProjectAttachmentRoots?.(projectAttachmentMentionTree)
	}, [dataService, projectAttachmentMentionTree])

	useEffect(() => {
		if (!canvas || !dataService?.invalidateCanvasElementsCache) return

		const invalidate = () => {
			dataService.invalidateCanvasElementsCache?.()
		}
		const unsubscribes = [
			canvas.eventEmitter.on("element:change", ({ data }) => {
				if (data?.phase === "transient") return
				invalidate()
			}),
			canvas.eventEmitter.on("canvas:clear", invalidate),
			canvas.eventEmitter.on("element:temporary:converted", invalidate),
			canvas.eventEmitter.on("document:loaded", invalidate),
			canvas.eventEmitter.on("document:restored", invalidate),
		]

		return () => {
			unsubscribes.forEach((unsubscribe) => unsubscribe())
		}
	}, [canvas, dataService])

	useEffect(() => {
		if (!dataService?.setCanvasReferenceElementsContext) return

		if (!canvas) {
			dataService.setCanvasReferenceElementsContext(undefined)
			return
		}

		dataService.setCanvasReferenceElementsContext({
			canvasName: mentionFileSubtitleParentPrefix,
			rootFolderId: defaultProjectAttachmentFolderId,
			getCanvasDocument: () => canvas.exportDocument({ includeTemporary: false }),
		})

		queueMicrotask(() => {
			dataService.requestRefresh?.()
		})

		return () => {
			dataService.setCanvasReferenceElementsContext?.(undefined)
		}
	}, [canvas, dataService, defaultProjectAttachmentFolderId, mentionFileSubtitleParentPrefix])

	useEffect(() => {
		if (!dataService?.requestRefresh) return
		queueMicrotask(() => {
			dataService.requestRefresh?.()
		})
	}, [
		dataService,
		projectAttachmentMentionTree,
		maxReferenceFiles,
		currentReferenceFiles,
		isReferenceFileLimitReached,
		referenceResourceType,
		referenceFileInfos,
		assetLimits,
		currentAssetCounts,
		projectFilesPathPrefix,
		mentionFileSubtitleParentPrefix,
		defaultProjectAttachmentFolderId,
	])

	const initialLoadOptions = useMemo<ReferenceResourcePanelInitialLoadOptions | undefined>(() => {
		if (!defaultProjectAttachmentFolderId) return undefined
		return {
			itemId: defaultProjectAttachmentFolderId,
		}
	}, [defaultProjectAttachmentFolderId])

	const initialNavigationStack = useMemo<
		ReferenceResourcePanelNavigationItem[] | undefined
	>(() => {
		if (!defaultProjectAttachmentFolderId || !defaultProjectAttachmentFolderName)
			return undefined
		return [
			{
				id: defaultProjectAttachmentFolderId,
				name: defaultProjectAttachmentFolderName,
				state: CANVAS_REFERENCE_MENTION_PANEL_STATE.default,
			},
		]
	}, [defaultProjectAttachmentFolderId, defaultProjectAttachmentFolderName])
	const initialLoadOptionsRef = useRef(initialLoadOptions)
	initialLoadOptionsRef.current = initialLoadOptions
	const initialNavigationStackRef = useRef(initialNavigationStack)
	initialNavigationStackRef.current = initialNavigationStack

	const getInitialLoadOptions = useCallback(() => initialLoadOptionsRef.current, [])
	const getInitialNavigationStack = useCallback(() => initialNavigationStackRef.current, [])

	return {
		dataService,
		projectAttachmentMentionTree,
		projectFilesPathPrefix,
		mentionFileSubtitleParentPrefix,
		initialLoadOptions,
		initialNavigationStack,
		getInitialLoadOptions,
		getInitialNavigationStack,
		catalogBehavior: canvasReferenceMentionCatalogBehavior,
		canSelectItem: canSelectCanvasReferenceMentionItem,
	}
}
