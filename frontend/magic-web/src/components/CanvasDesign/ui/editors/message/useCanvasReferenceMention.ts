import { createElement, useMemo, useRef } from "react"
import { NodeViewWrapper } from "@tiptap/react"
import { useMagic } from "../../../app/providers/MagicProvider"
import type {
	CanvasMentionAttributes,
	CanvasMentionExtensionRuntimeOptions,
	CanvasMentionNodeViewRenderer,
	ProjectAttachmentMentionNode,
	ReferenceResourcePanelFileData,
} from "../../../public/props"
import { MENTION_CARET_GUARD_TEXT, type MatchableMentionItem } from "./tiptap/contentUtils"
import type {
	ReferenceAssetPerTypeLimits,
	ReferenceAssetTypeCounts,
	ReferenceResourceTypeFilter,
} from "./reference-assets/reference-resource.types"
import {
	isReferenceResourceTypeAllowed,
	isReferenceSelectionLimitBlocked,
	classifyReferenceAssetFile,
	isReferenceAssetTypeCapacityBlocked,
} from "./reference-assets/referenceResourceSelection"
import { useCanvasReferenceMentionRuntime } from "./reference-assets/useCanvasReferenceMentionRuntime"
import { CANVAS_REFERENCE_MENTION_ITEM_TYPE } from "./reference-assets/canvasReferenceMention.constants"
import { MentionPanelViewMode } from "@/components/business/MentionPanel/types"
import { getCanvasResourceIdentity } from "../../../runtime/shared/path/canvasResourcePath"

interface UseCanvasReferenceMentionOptions {
	/** 可匹配的项列表（从 referenceImagesState 派生） */
	matchableItems?: MatchableMentionItem[]
	/** 外部显式控制 @ 功能可用性；不传时使用默认模型就绪判定 */
	mentionEnabledOverride?: boolean
	/** 最大参考文件数量限制 */
	maxReferenceFiles?: number
	/** 当前已选中的参考文件路径列表 */
	currentReferenceFiles?: string[]
	/** 是否已达到参考文件数量限制 */
	isReferenceFileLimitReached?: boolean
	/** 当前资源选择器允许的文件类型 */
	referenceResourceType?: ReferenceResourceTypeFilter
	/** 按类型细分的限制对象（视频编辑器场景传入，可覆盖总数判断） */
	assetLimits?: ReferenceAssetPerTypeLimits
	/** 当前已选各类型资源数量（与 assetLimits 配套使用） */
	currentAssetCounts?: ReferenceAssetTypeCounts
}

/**
 * 复用 MessageEditor @ 面板所需数据：matchableItems、mentionDataService
 * 供图片与视频编辑器共用
 *
 * mentionDataService 实例仅随 ctor 变化；附件树通过 syncProjectAttachmentRoots 同步，
 * limitInfo 由共享 reference mention runtime 管理，避免两个 @文件入口各自维护默认目录与过滤规则。
 */
export function useCanvasReferenceMention(options?: UseCanvasReferenceMentionOptions) {
	const {
		projectAttachmentMentionTree = [],
		mentionExtension: MentionExtensionClass,
		methods,
		isLoadingImageModelList = false,
		imageModelList = [],
	} = useMagic()
	const {
		matchableItems: externalMatchableItems = [],
		mentionEnabledOverride,
		maxReferenceFiles,
		currentReferenceFiles = [],
		isReferenceFileLimitReached = false,
		referenceResourceType = "image",
		assetLimits,
		currentAssetCounts,
	} = options || {}

	// nodeView 点击时读取最新宿主方法，避免因宿主回传新引用而重建 nodeView renderer。
	const locateProjectFileRef = useRef(methods?.locateProjectFile)
	locateProjectFileRef.current = methods?.locateProjectFile

	const referenceFileInfos = useMemo(
		() =>
			externalMatchableItems.map((item) => ({
				src: item.path || "",
				fileName: item.name,
				path: item.path || "",
			})),
		[externalMatchableItems],
	)

	const referenceMentionRuntime = useCanvasReferenceMentionRuntime({
		maxReferenceFiles,
		currentReferenceFiles,
		isReferenceFileLimitReached,
		referenceResourceType,
		referenceFileInfos,
		assetLimits,
		currentAssetCounts,
	})
	const {
		dataService: mentionDataService,
		getInitialLoadOptions,
		getInitialNavigationStack,
		catalogBehavior,
		canSelectItem,
	} = referenceMentionRuntime

	// 合并项目文件与当前元素参考文件（去重，外部优先）
	const matchableItems = useMemo(() => {
		const result: MatchableMentionItem[] = []
		const seenPathIdentities = new Set<string>()

		const pushItem = (item: MatchableMentionItem) => {
			if (item.path) {
				const identity = getCanvasResourceIdentity(item.path)
				if (seenPathIdentities.has(identity)) return
				seenPathIdentities.add(identity)
			}
			result.push(item)
		}

		// 优先放入当前元素参考文件，确保同名文件在 string -> mention 解析时优先命中当前上下文路径。
		externalMatchableItems.forEach((item) => {
			pushItem(item)
		})

		for (const item of flattenProjectAttachmentFiles(projectAttachmentMentionTree)) {
			pushItem({
				name: item.name,
				path: item.path,
				disabled: !isReferenceResourceTypeAllowed({
					fileName: item.name,
					filePath: item.path,
					referenceResourceType,
				}),
			})
		}

		return result.map((item) => ({
			...item,
			disabled:
				Boolean(item.disabled) ||
				(assetLimits && currentAssetCounts
					? isReferenceAssetTypeCapacityBlocked({
							fileClass: classifyReferenceAssetFile({
								filePath: item.path,
								fileName: item.name,
							}),
							assetLimits,
							currentAssetCounts,
							candidatePaths: [item.path, item.name],
							currentReferenceFiles,
						})
					: isReferenceSelectionLimitBlocked({
							candidatePaths: [item.path, item.name],
							currentReferenceFiles,
							isReferenceFileLimitReached,
						})),
		}))
	}, [
		projectAttachmentMentionTree,
		externalMatchableItems,
		isReferenceFileLimitReached,
		currentReferenceFiles,
		referenceResourceType,
		assetLimits,
		currentAssetCounts,
	])

	const mentionNodeViewRenderers = useMemo(() => {
		const projectFileRenderer: CanvasMentionNodeViewRenderer = (props) => {
			const attrs = props.node.attrs as CanvasMentionAttributes & {
				data?: ReferenceResourcePanelFileData
			}
			const fileData = attrs.data
			const options = props.extension.options as CanvasMentionExtensionRuntimeOptions
			const displayText = getProjectFileMentionDisplayText(attrs, options)

			return createElement(
				NodeViewWrapper,
				{
					as: "span",
					className: "magic-mention canvas-project-file-mention",
					"data-mention-suggestion-char": attrs.mentionSuggestionChar || "@",
					"data-type": attrs.type,
					"data-data": JSON.stringify(attrs.data || {}),
					"data-file-path": fileData?.file_path,
					"data-testid": "canvas-project-file-mention",
					contentEditable: false,
					style: { cursor: "pointer" },
					onMouseDown: (event: MouseEvent) => {
						event.preventDefault()
					},
					onClick: (event: MouseEvent) => {
						event.preventDefault()
						event.stopPropagation()
						const locateProjectFile = locateProjectFileRef.current
						if (!locateProjectFile) return
						void locateProjectFile({
							fileId: fileData?.file_id,
							filePath: fileData?.file_path,
							fileName: fileData?.file_name,
							locateInTree: true,
						})
					},
				},
				displayText,
			)
		}

		return {
			[CANVAS_REFERENCE_MENTION_ITEM_TYPE.projectFile]: projectFileRenderer,
		}
	}, [])

	// 配置 MentionExtension，通过依赖注入实现组件隔离
	const mentionExtension = useMemo(() => {
		if (!mentionDataService || !MentionExtensionClass) return null
		return MentionExtensionClass.configure({
			language: "zh-CN",
			getParentContainer: () => document.body,
			dataService: mentionDataService,
			getInitialLoadOptions,
			getInitialNavigationStack,
			catalogBehavior,
			viewMode: MentionPanelViewMode.GALLERY,
			galleryOptions: { enablePreviewModal: true },
			trailingTextAfterInsert: MENTION_CARET_GUARD_TEXT,
			canSelectItem,
			nodeViewRenderers: mentionNodeViewRenderers,
		})
	}, [
		mentionDataService,
		MentionExtensionClass,
		getInitialLoadOptions,
		getInitialNavigationStack,
		catalogBehavior,
		canSelectItem,
		mentionNodeViewRenderers,
	])

	const mentionEnabledByModel = !isLoadingImageModelList && imageModelList.length > 0
	const mentionEnabledByCapability =
		mentionEnabledOverride === undefined ? mentionEnabledByModel : mentionEnabledOverride

	return {
		matchableItems,
		mentionDataService,
		mentionExtension,
		maxReferenceFiles,
		currentReferenceFiles,
		isReferenceFileLimitReached,
		mentionEnabled:
			!!mentionDataService &&
			mentionEnabledByCapability &&
			(maxReferenceFiles === undefined || maxReferenceFiles > 0),
	}
}

function flattenProjectAttachmentFiles(
	nodes: ProjectAttachmentMentionNode[],
): Array<{ name: string; path?: string; extension?: string }> {
	const out: Array<{ name: string; path?: string; extension?: string }> = []
	for (const n of nodes) {
		if (!n.isDirectory) {
			out.push({ name: n.name, path: n.path, extension: n.extension })
			continue
		}
		if (n.children?.length) out.push(...flattenProjectAttachmentFiles(n.children))
	}
	return out
}

function getProjectFileMentionDisplayText(
	attrs: CanvasMentionAttributes,
	options?: CanvasMentionExtensionRuntimeOptions,
) {
	const customText = options?.renderText?.({ options, node: { attrs } })
	const fileName = (attrs.data as ReferenceResourcePanelFileData | undefined)?.file_name
	return `@${customText ?? fileName ?? "File"}`.replace(/^@@/, "@")
}
