import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { isConvertibleFile } from "../../utils/file"
import IsolatedHTMLRenderer, {
	type IsolatedHTMLRendererContentMetrics,
	type IsolatedHTMLRendererRef,
} from "./IsolatedHTMLRenderer"
import {
	createParentMessageHandler,
	injectFetchInterceptorScript,
	injectKeyboardInterceptorScript,
	createKeyboardMessageHandler,
	POST_MESSAGE_TARGET_STRATEGIES,
	type FileItem,
} from "./utils/fetchInterceptor"
import { createNestedIframeContentHandler } from "./utils/nested-iframe-content"
import { createVirtualStorageMessageHandler } from "./utils/virtual-storage"
import { HTML_IFRAME_RENDER_LIFECYCLE_EVENT } from "./telemetry/iframeRenderLifecycle"
import type { SaveResult } from "./iframe-bridge/types"
import { useStyles } from "./styles"
import { useFileData } from "@/pages/superMagic/hooks/useFileData"
import { processHtmlContent, type HtmlPreviewBundledTemplateKind } from "./htmlProcessor"
import { resolveHtmlPreviewBundledTemplate } from "./html-preview-bundled-shell"
import {
	attemptHtmlSaveFlow,
	confirmHtmlConflictSave,
	resolveRelativePath,
	resolveServerUpdateState,
} from "./utils"
import { useDeepCompareEffect, useMemoizedFn, useUpdateEffect } from "ahooks"
import CommonHeaderV2 from "../../components/CommonHeaderV2"
import { Flex, Tour } from "antd"
import { shadow } from "@/utils/shadow"
import CodeEditor from "@/components/base/CodeEditor"
import { parseAnchorLink, scrollToAnchor } from "@/utils/slug"
import { HTMLGuideTourElementId, useHTMLGuideTour } from "@/pages/superMagic/hooks/useHTMLGuideTour"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import MagicSpin from "@/components/base/MagicSpin"
import DashboardIsolatedHTMLRenderer from "./dashboard/DashboardIsolatedHTMLRenderer"
import { inlineDashboardDataJs } from "./dashboard/resourceVersioning"
import { useDashboardVersioning } from "./dashboard/useDashboardVersioning"
import AIEditButton from "@/pages/superMagic/components/Detail/components/EditToolbar/AIEditButton"
import FileEditButtons from "@/pages/superMagic/components/Detail/components/EditToolbar/FileEditButtons"
import ActionButton from "@/pages/superMagic/components/Detail/components/CommonHeader/components/ActionButton"
import { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"
import CommonFooter from "../../components/CommonFooter"
import { useIsMobile } from "@/hooks/useIsMobile"
import useExportMenuItems from "./useExportMenuItems"
import Deleted from "../../components/Deleted"
import useSaveHandlerRegistration from "../../hooks/useSaveHandlerRegistration"
import { useCurrentHtmlFileInfo } from "./hooks/useCurrentHtmlFileInfo"
import useShareButtonVisibility from "../../hooks/useShareButtonVisibility"
import type { HeaderActionConfig } from "../../components/CommonHeaderV2/types"
import useServerUpdate from "../../hooks/useServerUpdate"
import CodeVersionCompareDialog from "../../components/versioning/CodeVersionCompareDialog"
import VersionCompareDialog from "../../components/versioning/VersionCompareDialog"
import HistoryVersionCompareDialog from "../../components/PPTRender/components/HistoryVersionCompareDialog"
import {
	getFileContentById,
	getTemporaryDownloadUrl,
	downloadFileContent,
} from "@/pages/superMagic/utils/api"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Crosshair, ShieldCheck, Terminal } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"
import { env } from "@/utils/env"
import { logger as Logger } from "@/utils/log"
import magicToast from "@/components/base/MagicToaster/utils"
import { type ImageExportFormat } from "@magic-web/html2image"
import { resolvePptScaleContentDimensions } from "./utils/slide-dimensions"
import { HTML_PREVIEW_IMAGE_PROCESS } from "./previewImageProcess"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/shadcn-ui/alert-dialog"
import { useHtmlAppPermissions } from "./hooks/useHtmlAppPermissions"
import { useHtmlDevConsoleState } from "./hooks/useHtmlDevConsoleState"
import {
	type HtmlPermissionManagerHandle,
	useHtmlPermissionManagerBridge,
} from "./hooks/useHtmlPermissionManagerBridge"

const htmlRenderLogger = Logger.createLogger("HTMLContent")
const HtmlPermissionManagerDialog = lazy(
	() => import("./components/PermissionManager/HtmlPermissionManagerDialog"),
)

interface HTMLProps {
	data: string | any
	attachments?: any[]
	type?: string
	currentIndex?: number
	onPrevious?: () => void
	onNext?: () => void
	onFullscreen?: () => void
	onDownload?: (fileId?: string, fileVersion?: number) => void
	totalFiles?: number
	userSelectDetail?: any
	hasUserSelectDetail?: boolean
	setUserSelectDetail?: (detail: any) => void
	isFromNode?: boolean
	onClose?: () => void
	isFullscreen?: boolean
	/** Keeps pure share fullscreen HTML in document flow for long screenshots. */
	documentFlowFullscreen?: boolean
	attachmentList?: any[]
	isEditMode?: boolean
	setIsEditMode?: (isEditMode: boolean) => void
	saveEditContent?: (
		data: any,
		fileId?: string,
		enable_shadow?: boolean,
		fetchFileVersions?: (fileId: string) => void,
	) => Promise<void>
	allowEdit?: boolean
	// New props for ActionButtons functionality
	viewMode?: "code" | "desktop" | "phone"
	onViewModeChange?: (mode: "code" | "desktop" | "phone") => void
	onCopy?: (fileVersion?: number, fileId?: string) => void
	fileContent?: string
	currentFile?: {
		id: string
		name: string
		type: string
		url?: string
	}
	className?: string
	updatedAt?: string
	detailMode?: "single" | "files"
	displayConfig?: any
	openFileTab?: (fileItem: any, autoEdit?: boolean) => void
	exportFile?: (fileId: string, fileVersion?: number) => void
	exportPdf?: (fileId: string) => void
	exportRasterPdf?: (fileId: string, pageMode: "fit" | "paginate") => void
	exportPpt?: (fileId: string) => void
	exportPptx?: (fileId: string) => void
	exportImage?: (fileId: string, format?: ImageExportFormat) => void
	isExporting?: boolean
	selectedProject?: ProjectListItem | null
	selectedTopic?: Topic | null
	showFileHeader?: boolean
	activeFileId?: string | null
	/** Live tab state, excluded from cached renderProps. */
	isTabActive?: boolean
	showFooter?: boolean
	onRefreshFile?: () => void
	onRegisterAIEdit?: (handler: (() => void) | null) => void
	onAIEditActiveChange?: (active: boolean) => void
	onRegisterDevConsoleToggle?: (handler: (() => void) | null) => void
	onDevConsoleActiveChange?: (active: boolean) => void
	/** 向无文件头的外部页面注册当前 HTML 的授权管理入口。 */
	onHtmlPermissionManagerChange?: (manager: HtmlPermissionManagerHandle | null) => void
	isPlaybackMode?: boolean
	onRegisterSaveHandler?: (handler: (() => Promise<void>) | null) => void
	isInPPTMode?: boolean
	// 是否允许下载（用于分享页面权限控制）
	allowDownload?: boolean
	projectId?: string
	/** 跨多个 HTML 文件共享虚拟存储时使用的稳定标记。 */
	virtualStorageMarkerId?: string
}

interface HtmlExportActionProps {
	handleExportSource: () => void
	handleExportPDF: () => void
	handleExportPPT: () => void
	handleExportPptx: () => void
	handleExportImage?: (format: ImageExportFormat) => void
	handleExportRasterPdf?: (pageMode: "fit" | "paginate") => void
	isExporting?: boolean
	supportPPT: boolean
	showButtonText: boolean
	showExportPptx?: boolean
	showExportImage?: boolean
	showExportRasterPdf?: boolean
}

const HtmlExportAction = memo(function HtmlExportAction({
	handleExportSource,
	handleExportPDF,
	handleExportPPT,
	handleExportPptx,
	handleExportImage,
	handleExportRasterPdf,
	isExporting,
	supportPPT,
	showButtonText,
	showExportPptx,
	showExportImage,
	showExportRasterPdf,
}: HtmlExportActionProps) {
	const { ExportDropdownButton } = useExportMenuItems({
		handleExportSource,
		handleExportPDF,
		handleExportPPT,
		handleExportPptx,
		handleExportImage,
		handleExportRasterPdf,
		isExporting,
		showButtonText,
		supportPPT,
		showExportPptx,
		showExportImage,
		showExportRasterPdf,
	})

	return ExportDropdownButton
})

export default memo(function HTML(props: HTMLProps) {
	const {
		data: displayData,
		attachments,
		type,
		onFullscreen,
		onDownload,
		isFromNode,
		isFullscreen,
		documentFlowFullscreen = false,
		attachmentList,
		isEditMode,
		setIsEditMode,
		saveEditContent,
		allowEdit,
		viewMode,
		onViewModeChange,
		onCopy,
		fileContent,
		currentFile,
		className,
		updatedAt,
		detailMode,
		displayConfig: externalDisplayConfig,
		openFileTab,
		exportFile,
		exportPdf,
		exportRasterPdf,
		exportPpt,
		exportPptx,
		exportImage,
		isExporting,
		selectedProject,
		showFileHeader = true,
		activeFileId,
		isTabActive,
		showFooter,
		onRefreshFile,
		onRegisterAIEdit,
		onAIEditActiveChange,
		onRegisterDevConsoleToggle,
		onDevConsoleActiveChange,
		onHtmlPermissionManagerChange,
		isPlaybackMode = false,
		onRegisterSaveHandler,
		isInPPTMode = false,
		allowDownload,
		virtualStorageMarkerId,
	} = props

	const displayConfig = displayData?.display_config || externalDisplayConfig
	const { styles, cx } = useStyles()
	const { t } = useTranslation("super")
	const isMobile = useIsMobile()
	const isImmersiveLayout = !showFileHeader && !showFooter
	// The simulated phone frame has a fixed height and cannot be used for page-level scrolling.
	const shouldUsePhonePreviewFrame = !documentFlowFullscreen && viewMode === "phone"
	// 通过 previewPolicy 声明能力，详情页消费配置
	const previewPolicy = displayData?.display_config?.previewPolicy
	const isReadonlyPreview = previewPolicy?.readonly === true
	const remoteHtmlFileId =
		previewPolicy?.keepLocalContent === true ? "" : displayData?.file_id || ""

	const [processedContent, setProcessedContent] = useState<string>("")
	const [filePathMapping, setFilePathMapping] = useState<Map<string, string>>(new Map()) // 记录文件的相对路径和替换后的url映射关系
	// 跨域 shell 渲染下，数据加载完成 ≠ iframe 内容已画出来；
	// 用 iframe 上报的渲染就绪信号来控制预览 loading 收起时机，避免"loading 没了但页面空白"。
	const [isPreviewRenderReady, setIsPreviewRenderReady] = useState(false)
	const [documentFlowContentHeight, setDocumentFlowContentHeight] = useState(0)
	const [saveFunction, setSaveFunction] = useState<
		(() => Promise<SaveResult | undefined>) | (() => void) | null
	>(null) // 保存函数
	const [renderKey, setRenderKey] = useState(0)
	/** 当前展示的 HTML 文件的数据 */
	const [data, setData] = useState<any>({})
	const [editingCodeContent, setEditingCodeContent] = useState<string>("")
	/** 是否正处于编辑后的状态 */
	const [isEditingAfter, setIsEditingAfter] = useState(false)
	const [serverUpdatedContent, setServerUpdatedContent] = useState<string>()
	const editSessionUpdatedAtRef = useRef<string | undefined>(undefined)
	const serverUpdateRequestIdRef = useRef(0)
	const editSessionBaselineContentRef = useRef<string | null>(null)
	// Tracks the last successful local save so the follow-up refresh is not treated as an external update.
	const lastLocalSavedContentRef = useRef<string | null>(null)
	const pendingSaveIntentRef = useRef<"save" | "save-and-exit" | null>(null)
	const scaleContentDimensions = useMemo(
		() =>
			isInPPTMode ? resolvePptScaleContentDimensions(processedContent, data?.content) : null,
		[isInPPTMode, processedContent, data?.content],
	)

	const {
		fileData: htmlFileData,
		fileVersion: htmlFileVersion,
		changeFileVersion: changeHtmlFileVersion,
		loading,
		fetchFileVersions: fetchHtmlFileVersions,
		fileVersionsList: htmlFileVersionsList,
		handleVersionRollback: handleHtmlVersionRollback,
		isNewestVersion: htmlIsNewestVersion,
		isDeleted: htmlIsDeleted,
	} = useFileData({
		file_id: remoteHtmlFileId,
		isEditing: isEditMode,
		updatedAt,
		activeFileId,
		isFromNode,
		content: displayData?.content || "",
		disabledUrlCache: isPlaybackMode,
	})

	const {
		allAttachmentItems,
		flattenedAttachmentList,
		isDataAnalysis,
		dashboardDataJsFile,
		dashboardDataJsContent,
		activeHistory,
		resourceFileVersions,
		fetchDashboardDataJsFileVersions,
	} = useDashboardVersioning({
		attachmentList,
		displayData,
		displayConfig,
		isFromNode,
		isPlaybackMode,
		htmlVersioning: {
			fileVersion: htmlFileVersion,
			changeFileVersion: changeHtmlFileVersion,
			fileVersionsList: htmlFileVersionsList,
			handleVersionRollback: handleHtmlVersionRollback,
			isNewestVersion: htmlIsNewestVersion,
			loading,
		},
	})

	/** 头部刷新：拉取 HTML / data.js 版本列表；若最新版本号变新则切到最新并加载 */
	const handleDetailHeaderRefresh = useMemoizedFn(async () => {
		if (!displayData?.file_id) return

		// Use live tab state because cached activeFileId may be stale.
		const isCurrentTabActive =
			isTabActive === undefined ? activeFileId === displayData.file_id : isTabActive
		if (!isCurrentTabActive) return

		const htmlFileId = displayData.file_id
		const prevHtmlNewest = htmlFileVersionsList[0]?.version
		const newHtmlVersions = await fetchHtmlFileVersions(htmlFileId, false)
		const nextHtmlNewest = newHtmlVersions[0]?.version
		if (
			typeof prevHtmlNewest === "number" &&
			typeof nextHtmlNewest === "number" &&
			nextHtmlNewest > prevHtmlNewest
		) {
			changeHtmlFileVersion(undefined, newHtmlVersions)
		}

		if (!isDataAnalysis || !dashboardDataJsFile?.file_id) return

		const dataJsId = dashboardDataJsFile.file_id
		const prevDataNewest = activeHistory.fileVersionsList[0]?.version
		const newDataVersions = await fetchDashboardDataJsFileVersions(dataJsId, false)
		const nextDataNewest = newDataVersions[0]?.version
		if (
			typeof prevDataNewest === "number" &&
			typeof nextDataNewest === "number" &&
			nextDataNewest > prevDataNewest
		) {
			activeHistory.changeFileVersion(undefined)
		}
	})

	useEffect(() => {
		pubsub.subscribe(PubSubEvents.Super_Magic_Detail_Refresh, handleDetailHeaderRefresh)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Super_Magic_Detail_Refresh, handleDetailHeaderRefresh)
		}
	}, [handleDetailHeaderRefresh])

	const currentHtmlFileInfo = useCurrentHtmlFileInfo({
		attachmentList: allAttachmentItems,
		fileId: displayData?.file_id,
		fallbackFileName: data?.file_name || displayData?.file_name,
	})
	const htmlPermissionController = useHtmlAppPermissions({
		content: processedContent,
		rawSourceCode: data?.content,
		relativeFilePath: currentHtmlFileInfo.relativeFilePath,
		projectId: selectedProject?.id,
		fileList: flattenedAttachmentList,
		enabled: !isDataAnalysis && !htmlIsDeleted,
	})
	const {
		hasHtmlPermissionDeclarations,
		getPermissionSnapshot,
		preauthorizeHtmlPermission,
		revokeHtmlPermission,
		updateHtmlPermissionTtl,
		revokeAllHtmlPermissions,
		permissionRevision,
	} = htmlPermissionController
	const canManageHtmlPermissions = Boolean(
		!isDataAnalysis && !htmlIsDeleted && hasHtmlPermissionDeclarations,
	)
	const {
		open: permissionManagerOpen,
		setOpen: setPermissionManagerOpen,
		openManager: handleOpenHtmlPermissionManager,
	} = useHtmlPermissionManagerBridge({
		available: canManageHtmlPermissions,
		onManagerChange: onHtmlPermissionManagerChange,
	})

	/**
	 * 仅可视化预览：dashboard / audio / video 入口 HTML 走构建内 templates；dashboard 另换壳 CSS/JS。
	 * 代码模式、编辑、回放、PPT 仍用用户仓库 HTML + OSS。
	 */
	const htmlPreviewBundledTemplate = useMemo((): HtmlPreviewBundledTemplateKind | undefined => {
		if (viewMode === "code" || isPlaybackMode || isInPPTMode) return undefined
		if (isEditMode && !isDataAnalysis) return undefined
		return resolveHtmlPreviewBundledTemplate({
			fileName: currentHtmlFileInfo.fileName || data?.file_name,
			relativeFilePath: currentHtmlFileInfo.relativeFilePath,
			displayConfigType: displayConfig?.type,
		})
	}, [
		currentHtmlFileInfo,
		data?.file_name,
		displayConfig?.type,
		isDataAnalysis,
		isEditMode,
		viewMode,
		isPlaybackMode,
		isInPPTMode,
	])

	/** 更新HTML文件的数据内容 */
	const updateDataContent = useMemoizedFn((fileData: any) => {
		const newData = {
			...displayData,
			content: fileData || displayData?.content,
		}
		if (data.content !== newData.content) {
			setData(newData)
		}
	})

	useDeepCompareEffect(() => {
		// 如果正处于编辑后的状态，则不进行content更新，避免页面内容发生闪动
		if (isEditingAfter) {
			setIsEditingAfter(false)
			return
		}
		updateDataContent(htmlFileData)
	}, [htmlFileData])

	/** 处理代码预览模式 */
	useUpdateEffect(() => {
		if (viewMode === "code") {
			const newData = {
				...displayData,
				content: htmlFileData || displayData?.content,
			}
			setData(newData)
		} else {
			updateDataContent(htmlFileData)
		}
	}, [viewMode])

	// IsolatedHTMLRenderer 的 ref，用于获取拦截回调函数
	const htmlRendererRef = useRef<IsolatedHTMLRendererRef>(null)
	const fileId = displayData?.file_id as string | undefined
	const [isAppendPicking, setIsAppendPicking] = useState(false)
	const handleAIEdit = useMemoizedFn(() => {
		if (isAppendPicking) {
			htmlRendererRef.current?.stopInspector()
		} else {
			htmlRendererRef.current?.startInspectorAppend()
		}
	})

	useEffect(() => {
		onRegisterAIEdit?.(handleAIEdit)
		return () => onRegisterAIEdit?.(null)
	}, [handleAIEdit, onRegisterAIEdit])

	useEffect(() => {
		onAIEditActiveChange?.(isAppendPicking)
	}, [isAppendPicking, onAIEditActiveChange])
	const {
		enabled: devConsoleEnabled,
		setEnabled: updateDevConsoleEnabled,
		toggle: handleDevConsoleToggle,
	} = useHtmlDevConsoleState({
		fileId,
		onRegisterToggle: onRegisterDevConsoleToggle,
		onEnabledChange: onDevConsoleActiveChange,
	})

	const getCurrentEditingContent = useMemoizedFn(async () => {
		if (viewMode === "code") return editingCodeContent || data?.content || ""
		return (await htmlRendererRef.current?.getContent()) || data?.content || ""
	})

	const applyEditingContent = useMemoizedFn((nextContent: string) => {
		if (viewMode !== "code") return

		setEditingCodeContent(nextContent)
		setData((prev: any) => ({
			...prev,
			content: nextContent,
		}))
	})

	const getEditSessionBaselineContent = useMemoizedFn(() => {
		return data?.content || htmlFileData || displayData?.content || ""
	})

	const {
		hasServerUpdate,
		actualServerContent,
		showVersionCompareDialog,
		showSaveWithUpdateConfirmDialog,
		currentEditingContent,
		handleViewServerUpdate,
		handleUseMyVersion,
		handleUseServerVersion,
		clearServerUpdate,
		checkServerUpdateBeforeSave,
		setShowVersionCompareDialog,
		setShowSaveWithUpdateConfirmDialog,
		applyServerUpdate,
	} = useServerUpdate({
		externalServerUpdatedContent: serverUpdatedContent,
		onClearServerUpdate: () => {
			setServerUpdatedContent(undefined)
		},
		isEditMode: Boolean(isEditMode),
		rendererRef: htmlRendererRef,
		content: data?.content || displayData?.content || "",
		getCurrentEditingContent,
		applyContent: applyEditingContent,
	})

	// ==================== 历史版本对比 ====================
	const [showHistoryCompareDialog, setShowHistoryCompareDialog] = useState(false)
	const [compareHistoryVersion, setCompareHistoryVersion] = useState<number | undefined>(
		undefined,
	)
	const [compareHistoryContent, setCompareHistoryContent] = useState<string>("")
	/** Ignore stale history version fetch responses when user switches versions quickly */
	const compareHistorySwitchSeqRef = useRef(0)

	/** 获取指定版本内容用于对比（不改变当前显示版本） */
	const getVersionContentForCompare = useMemoizedFn(
		async (targetVersion: number): Promise<string | null> => {
			if (!fileId) return null
			try {
				const urlRes = await getTemporaryDownloadUrl({
					file_ids: [fileId],
					file_versions: { [fileId]: targetVersion },
				})
				if (!urlRes[0]?.url) {
					magicToast.error(t("common.fileUrlFetchFailed"))
					return null
				}
				const content = await downloadFileContent(urlRes[0].url, { responseType: "text" })
				return content as string
			} catch (error) {
				console.error("Failed to download version content for compare:", error)
				magicToast.error(t("common.fileDownloadFailed"))
				return null
			}
		},
	)

	/** 处理历史版本内容（路径替换） */
	const processHistoricalContent = useMemoizedFn(async (rawHtml: string): Promise<string> => {
		try {
			const result = await processHtmlContent({
				content: rawHtml,
				attachments,
				fileId,
				fileName: data?.file_name,
				attachmentList,
				displayConfig,
				xMagicImageProcess: HTML_PREVIEW_IMAGE_PROCESS,
			})
			return result.processedContent
		} catch {
			return rawHtml
		}
	})

	/** 点击历史版本 → 打开对比弹窗 */
	const handleCompareVersion = useMemoizedFn(async (version: number) => {
		try {
			const raw = await getVersionContentForCompare(version)
			if (raw) {
				const processed = await processHistoricalContent(raw)
				// 将三个状态更新批量提交，确保 HistoryVersionCompareDialog 首次挂载时
				// historyContent 已就绪，避免组件以空内容初始化后无法正确渲染
				setCompareHistoryVersion(version)
				setCompareHistoryContent(processed)
				setShowHistoryCompareDialog(true)
			}
		} catch (error) {
			console.error("Failed to load version for comparison:", error)
		}
	})

	/** 在对比弹窗中切换历史版本 */
	const handleSwitchHistoryVersion = useMemoizedFn(async (version: number) => {
		const switchId = ++compareHistorySwitchSeqRef.current
		try {
			const raw = await getVersionContentForCompare(version)
			if (switchId !== compareHistorySwitchSeqRef.current) return
			if (!raw) {
				throw new Error(`Failed to load history version ${version}`)
			}
			const processed = await processHistoricalContent(raw)
			if (switchId !== compareHistorySwitchSeqRef.current) return
			// Update content and version together so dialog does not render mismatched state
			setCompareHistoryContent(processed)
			setCompareHistoryVersion(version)
		} catch (error) {
			console.error("Failed to switch history version:", error)
			throw error
		}
	})

	/** 使用历史版本 → 执行回滚并刷新 */
	const handleUseHistoryVersionFromCompare = useMemoizedFn(async (version: number) => {
		try {
			setShowHistoryCompareDialog(false)
			await activeHistory.handleVersionRollback(version)
			onRefreshFile?.()
			if (fileId) {
				await fetchHtmlFileVersions(fileId, true)
			}
		} catch (error) {
			console.error("Failed to rollback to history version:", error)
		}
	})

	/** 保留最新版本 → 关闭对比弹窗 */
	const handleUseLatestVersionFromCompare = useMemoizedFn(() => {
		setShowHistoryCompareDialog(false)
	})
	// ======================================================

	useEffect(() => {
		setServerUpdatedContent(undefined)
		editSessionUpdatedAtRef.current = updatedAt
		editSessionBaselineContentRef.current = null
		// Reset local-save memory when the user switches to another file.
		lastLocalSavedContentRef.current = null
		// Do not depend on updatedAt here, otherwise external updates will be
		// consumed before the edit-session detection effect can compare them.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [displayData?.file_id])

	useEffect(() => {
		if (isEditMode) {
			if (editSessionUpdatedAtRef.current === undefined) {
				editSessionUpdatedAtRef.current = updatedAt
			}
			if (editSessionBaselineContentRef.current === null) {
				editSessionBaselineContentRef.current = getEditSessionBaselineContent()
			}
			return
		}

		setServerUpdatedContent(undefined)
		editSessionUpdatedAtRef.current = updatedAt
		editSessionBaselineContentRef.current = null
		// Leaving edit mode ends the current conflict-detection session.
		lastLocalSavedContentRef.current = null
	}, [getEditSessionBaselineContent, isEditMode, updatedAt])

	useEffect(() => {
		if (!isEditMode || !displayData?.file_id || !updatedAt) return
		if (editSessionUpdatedAtRef.current === undefined) {
			editSessionUpdatedAtRef.current = updatedAt
			return
		}
		if (editSessionUpdatedAtRef.current === updatedAt) return

		editSessionUpdatedAtRef.current = updatedAt
		const currentRequestId = serverUpdateRequestIdRef.current + 1
		serverUpdateRequestIdRef.current = currentRequestId

		getFileContentById(displayData.file_id, {
			responseType: "text",
		})
			.then(async (latestContent) => {
				if (serverUpdateRequestIdRef.current !== currentRequestId) return
				if (typeof latestContent !== "string") return

				const { shouldPrompt, nextLastLocalSavedContent } = resolveServerUpdateState({
					latestContent,
					sessionBaselineContent: editSessionBaselineContentRef.current,
					lastLocalSavedContent: lastLocalSavedContentRef.current,
				})

				lastLocalSavedContentRef.current = nextLastLocalSavedContent

				if (!shouldPrompt) {
					setServerUpdatedContent(undefined)
					return
				}

				setServerUpdatedContent(latestContent)
			})
			.catch((error) => {
				console.error("[HTML] 获取服务端最新内容失败", error)
			})
	}, [displayData?.file_id, getCurrentEditingContent, isEditMode, updatedAt])

	const refreshServerUpdateState = useMemoizedFn(async () => {
		if (!displayData?.file_id) return false

		const latestContent = await getFileContentById(displayData.file_id, {
			responseType: "text",
		})
		if (typeof latestContent !== "string") return false

		const { shouldPrompt, nextLastLocalSavedContent } = resolveServerUpdateState({
			latestContent,
			sessionBaselineContent: editSessionBaselineContentRef.current,
			lastLocalSavedContent: lastLocalSavedContentRef.current,
		})

		lastLocalSavedContentRef.current = nextLastLocalSavedContent

		if (!shouldPrompt) {
			setServerUpdatedContent(undefined)
			return false
		}

		setServerUpdatedContent(latestContent)
		return true
	})

	const postMessageTargetStrategy = useMemo(
		() =>
			env("MAGIC_HTML_SANDBOX_URL")
				? POST_MESSAGE_TARGET_STRATEGIES.CROSS_ORIGIN_PARENT
				: POST_MESSAGE_TARGET_STRATEGIES.SAME_ORIGIN_ANCESTOR,
		[],
	)

	// 创建消息处理器并注册/移除监听器（即使没有 attachments 也要注册）
	useEffect(() => {
		// 获取当前HTML文件的相对文件夹路径
		let htmlRelativeFolderPath = "/"
		const currentFileId = displayData?.file_id
		if (currentFileId && flattenedAttachmentList.length > 0) {
			const currentFile = flattenedAttachmentList.find(
				(item) => item.file_id === currentFileId,
			)
			if (currentFile && currentFile.relative_file_path && currentFile.file_name) {
				// 从relative_file_path中去掉file_name，得到文件夹路径
				htmlRelativeFolderPath = currentFile.relative_file_path.replace(
					currentFile.file_name,
					"",
				)
			}
		}
		// 即使没有 attachments 也创建空数组，确保拦截器能正常工作
		const allFiles = flattenedAttachmentList as FileItem[]

		// 获取拦截回调函数
		const onFetchIntercepted = htmlRendererRef.current?.getFetchInterceptedCallback()

		// 创建新的消息处理器，传入 fileId 和回调函数
		const messageHandler = createParentMessageHandler(
			allFiles,
			htmlRelativeFolderPath,
			currentFileId || "",
			onFetchIntercepted,
		)

		// 处理嵌套 HTML iframe 内容请求
		const nestedIframeHandler = createNestedIframeContentHandler(
			allFiles,
			htmlRelativeFolderPath,
			currentFileId || "",
			attachmentList || [],
			{
				postMessageTargetStrategy,
				projectId: selectedProject?.id,
				topicId: selectedProject?.current_topic_id,
				parentTargetOrigin: window.location.origin,
				onTelemetry: (data) => {
					htmlRenderLogger.report(HTML_IFRAME_RENDER_LIFECYCLE_EVENT, {
						renderMode: env("MAGIC_HTML_SANDBOX_URL") ? "cross-origin" : "same-origin",
						shellUrl: env("MAGIC_HTML_SANDBOX_URL") || "/husky.html",
						fileId: currentFileId || "",
						relativeFilePath: htmlRelativeFolderPath,
						...data,
					})
				},
			},
		)

		// 处理来自 iframe 的键盘快捷键消息
		const keyboardMessageHandler = createKeyboardMessageHandler({
			onSave: handleSave,
			onSaveAndExit: handleSaveAndExit,
			onCancel: handleCancel,
		})
		const virtualStorageMessageHandler = createVirtualStorageMessageHandler()

		window.addEventListener("message", messageHandler)
		window.addEventListener("message", nestedIframeHandler)
		window.addEventListener("message", keyboardMessageHandler)
		window.addEventListener("message", virtualStorageMessageHandler)

		return () => {
			window.removeEventListener("message", messageHandler)
			window.removeEventListener("message", nestedIframeHandler)
			window.removeEventListener("message", keyboardMessageHandler)
			window.removeEventListener("message", virtualStorageMessageHandler)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [attachmentList, displayData?.file_id])

	const processContent = useMemoizedFn(async () => {
		if (isDataAnalysis && !activeHistory.isPreviewReady) return

		try {
			const result = await processHtmlContent({
				content: data?.content,
				attachments,
				fileId: displayData?.file_id,
				fileName: data?.file_name,
				attachmentList,
				displayConfig,
				resourceFileVersions,
				htmlPreviewBundledTemplate,
				xMagicImageProcess: HTML_PREVIEW_IMAGE_PROCESS,
			})

			let finalProcessedContent = result.processedContent
			finalProcessedContent = inlineDashboardDataJs({
				html: finalProcessedContent,
				dataJsContent: dashboardDataJsContent,
			})

			// 注入fetch拦截器脚本（默认启用）
			// 注意：media拦截器现在在htmlProcessor中根据display_config.type自动注入
			finalProcessedContent = injectFetchInterceptorScript(finalProcessedContent, {
				fileId: displayData?.file_id || "",
				postMessageTargetStrategy,
			})

			// dashboard 通过 postMessage 驱动编辑态，不需要额外注入键盘拦截器；
			// 否则会导致内容指纹变化并触发 iframe 二次重写。
			if (isEditMode && !isDataAnalysis) {
				finalProcessedContent = injectKeyboardInterceptorScript(finalProcessedContent)
			}

			setProcessedContent(finalProcessedContent)
			setFilePathMapping(result.filePathMapping)
		} catch (error) {
			console.error("Error processing HTML content:", error)
			setProcessedContent(data?.content || "")
		}
	})

	const shouldReprocessOnEditMode = !isDataAnalysis && Boolean(isEditMode)

	useDeepCompareEffect(() => {
		if (!data?.content) return
		if (isDataAnalysis && !activeHistory.isPreviewReady) return
		processContent()
	}, [
		data,
		displayConfig,
		shouldReprocessOnEditMode,
		htmlPreviewBundledTemplate,
		resourceFileVersions,
		dashboardDataJsContent,
		isDataAnalysis,
		activeHistory.isPreviewReady,
	])

	// 编辑态下，附件 updated_at 变化会导致 processedContent 重算并触发 iframe setContent，
	// 进而打断未保存编辑；因此仅在非编辑态响应 attachmentList 变化。
	useDeepCompareEffect(() => {
		if (isEditMode) return
		if (!data?.content) return
		if (isDataAnalysis && !activeHistory.isPreviewReady) return
		processContent()
	}, [
		attachmentList,
		htmlPreviewBundledTemplate,
		resourceFileVersions,
		dashboardDataJsContent,
		isDataAnalysis,
		activeHistory.isPreviewReady,
	])

	// AI modification detection is now handled by PPTStore internally
	// This logic has been removed to simplify the component

	// 按钮处理函数
	const handleEdit = useMemoizedFn(() => {
		if (setIsEditMode) {
			editSessionBaselineContentRef.current = getEditSessionBaselineContent()
			setIsEditMode(true)
			// 初始化编辑内容
			setEditingCodeContent(data?.content || "")
		}
	})

	const performSave = useMemoizedFn(async () => {
		setIsEditingAfter(true)
		if (viewMode === "code" && editingCodeContent) {
			// 保存代码编辑内容
			await saveEditContent?.(
				shadow(editingCodeContent),
				displayData?.file_id,
				true,
				fetchHtmlFileVersions,
			)
			// Code mode saves exactly the editor text, so we can cache it directly.
			lastLocalSavedContentRef.current = editingCodeContent
			editSessionBaselineContentRef.current = editingCodeContent
			setData((prev: any) => ({
				...prev,
				content: editingCodeContent,
			}))
		} else if (saveFunction) {
			const result = await saveFunction()
			if (result && !result.success) {
				console.error("[HTML Editor] 保存失败", result)
			}
			if (result?.success) {
				// Visual mode returns the cleaned HTML that will be stored on the server.
				lastLocalSavedContentRef.current = result.cleanContent
				editSessionBaselineContentRef.current = result.cleanContent
			}
		}
		setShowSaveWithUpdateConfirmDialog(false)
		clearServerUpdate()
		// 不再退出编辑模式
	})

	const exitEditModeAfterSave = useMemoizedFn(() => {
		if (setIsEditMode) {
			setIsEditMode(false)
		}
		onRefreshFile?.()
	})

	const runSaveAttempt = useMemoizedFn(async (intent: "save" | "save-and-exit") => {
		pendingSaveIntentRef.current = intent

		const result = await attemptHtmlSaveFlow({
			shouldExitAfterSave: intent === "save-and-exit",
			refreshServerUpdateState,
			showConflictDialog: () => setShowSaveWithUpdateConfirmDialog(true),
			checkServerUpdateBeforeSave,
			performSave,
			exitEditMode: exitEditModeAfterSave,
			onRefreshServerUpdateError: (error: unknown) => {
				console.error("[HTML] 保存前检查服务端冲突失败", error)
			},
		})

		if (!result.isAwaitingConflictConfirmation) {
			pendingSaveIntentRef.current = null
		}

		return result.didSave
	})

	const handleSave = useMemoizedFn(async () => {
		await runSaveAttempt("save")
	})

	// Register save handler when in edit mode
	useSaveHandlerRegistration({
		isEditMode,
		handleSave,
		onRegisterSaveHandler,
	})

	const handleSaveAndExit = useMemoizedFn(async () => {
		await runSaveAttempt("save-and-exit")
	})

	const handleSaveConflictDialogChange = useMemoizedFn((open: boolean) => {
		setShowSaveWithUpdateConfirmDialog(open)
	})

	const handleDismissSaveWithUpdate = useMemoizedFn(() => {
		pendingSaveIntentRef.current = null
	})

	const handleConfirmSaveWithUpdate = useMemoizedFn(async () => {
		const shouldExitAfterSave = pendingSaveIntentRef.current === "save-and-exit"

		await confirmHtmlConflictSave({
			shouldExitAfterSave,
			performSave,
			exitEditMode: exitEditModeAfterSave,
		})

		pendingSaveIntentRef.current = null
	})

	const handleCancel = useMemoizedFn(async () => {
		pendingSaveIntentRef.current = null
		setShowSaveWithUpdateConfirmDialog(false)
		if (setIsEditMode) {
			setIsEditMode(false)
		}
		// 重置编辑内容
		setEditingCodeContent("")
		applyServerUpdate()
		clearServerUpdate()
		setRenderKey((prev) => prev + 1)
		onRefreshFile?.()
	})

	const handleAcceptMyVersion = useMemoizedFn((editedContent?: string) => {
		if (actualServerContent) {
			editSessionBaselineContentRef.current = actualServerContent
		}
		handleUseMyVersion(editedContent)
	})

	const handleAcceptServerVersion = useMemoizedFn((editedContent?: string) => {
		// Visual compare may return normalized HTML that differs from the raw server payload.
		// Keep the conflict baseline anchored to the last accepted server version so the next
		// save is not treated as a brand-new external conflict.
		const nextBaselineContent = actualServerContent || editedContent
		if (nextBaselineContent) {
			editSessionBaselineContentRef.current = nextBaselineContent
		}
		lastLocalSavedContentRef.current = null
		handleUseServerVersion(editedContent)
	})

	const quitEditMode = useMemoizedFn(() => {
		if (setIsEditMode) {
			setIsEditMode(false)
		}
		setEditingCodeContent("")
	})

	// 用于接收保存函数的回调
	const onSaveReady = useCallback(
		(triggerSave: () => Promise<SaveResult | undefined> | (() => void)) => {
			setSaveFunction(() => triggerSave)
		},
		[],
	)

	const handlePreviewRenderReady = useMemoizedFn(() => {
		setIsPreviewRenderReady(true)
	})

	// 待渲染内容变化（切换文件 / 内容更新 / 重新挂载）时重置渲染就绪态，重新显示 loading；
	// 同时设置兜底定时器，避免极端情况下 iframe 未上报就绪信号导致 loading 永久卡住。
	useEffect(() => {
		setIsPreviewRenderReady(false)
		// 空文件没有可写入 iframe 的内容，也不会触发 onRenderReady。
		// 此时预览本身已经完成（展示空白区域），应立即收起 loading。
		if (!processedContent) {
			setIsPreviewRenderReady(true)
			return
		}
		const fallbackTimer = window.setTimeout(() => {
			setIsPreviewRenderReady(true)
		}, 4000)
		return () => {
			window.clearTimeout(fallbackTimer)
		}
	}, [processedContent, renderKey])

	// 当 viewMode 变化时，退出编辑模式
	useEffect(() => {
		if (setIsEditMode && isEditMode) {
			setIsEditMode(false)
		}
		// 重置编辑内容
		setEditingCodeContent("")
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [viewMode])

	const openNewTab = (fileId: string, path: string, autoEdit?: boolean) => {
		// 防护检查：fileId 不能为空
		if (!fileId) {
			console.warn("openNewTab: fileId is empty, cannot open new tab")
			return
		}

		// Parse anchor from path
		const { filePath, anchor } = parseAnchorLink(path)

		// Handle pure anchor link (navigation within current document)
		if (!filePath && anchor) {
			scrollToAnchor(anchor, 80) // 80px offset for fixed headers
			return
		}

		const fileItem = attachmentList?.find((item: any) => item.file_id === fileId)

		// 防护检查：必须找到对应的文件项
		if (!fileItem || !fileItem.relative_file_path || !fileItem.file_name) {
			console.warn("openNewTab: fileItem not found or missing required fields", {
				fileId,
				fileItem,
			})
			return
		}

		const relativePath = fileItem.relative_file_path.replace(fileItem.file_name, "")
		const newPath = resolveRelativePath(relativePath, filePath)
		const item = attachmentList?.find((item: any) => item.relative_file_path === newPath)
		if (item) {
			openFileTab?.(item, autoEdit)

			// If there's an anchor, scroll to it after document loads
			if (anchor) {
				// Wait for document to render before scrolling
				setTimeout(() => {
					scrollToAnchor(anchor, 80)
				}, 300) // Adjust delay as needed
			}
		}
	}

	const handleExportSource = useMemoizedFn(() => {
		exportFile?.(displayData?.file_id, htmlFileVersion)
	})

	const handleExportPDF = useMemoizedFn(() => {
		exportPdf?.(displayData?.file_id)
	})

	const handleExportRasterPdf = useMemoizedFn((pageMode: "fit" | "paginate") => {
		exportRasterPdf?.(displayData?.file_id, pageMode)
	})

	const handleExportPPT = useMemoizedFn(() => {
		exportPpt?.(displayData?.file_id)
	})

	const handleExportPptx = useMemoizedFn(() => {
		exportPptx?.(displayData?.file_id)
	})

	const handleExportImage = useMemoizedFn((format: ImageExportFormat = "png") => {
		exportImage?.(displayData?.file_id, format)
	})

	const handleDownload = useMemoizedFn(() => {
		onDownload?.(displayData?.file_id, htmlFileVersion)
	})

	/** 是否为媒体场景（audio/video） */
	const isMediaScenario = displayConfig?.type === "audio" || displayConfig?.type === "video"
	const isCodeViewMode = viewMode === "code"
	const versionCompareFileName = data?.file_name || data?.title || "file.html"

	/** 是否显示 AI编辑 按钮 */
	const showAIOptimizationButton = useMemo(() => {
		if (isReadonlyPreview) {
			return false
		}
		// 当 display_config.type 为 audio/video 时，隐藏 AI 编辑按钮
		if (isMediaScenario) {
			return false
		}
		return !isMobile && allowEdit && !isEditMode && activeHistory.isNewestVersion
	}, [
		isReadonlyPreview,
		isMediaScenario,
		isMobile,
		allowEdit,
		isEditMode,
		activeHistory.isNewestVersion,
	])

	/** 是否显示 在线编辑 按钮 */
	const showFileEditButton = useMemo(() => {
		if (isReadonlyPreview) {
			return false
		}
		// 当 display_config.type 为 audio/video 时，隐藏编辑按钮
		if (isMediaScenario) {
			return false
		}
		return (
			setIsEditMode &&
			allowEdit &&
			!isMobile &&
			(saveFunction !== null || viewMode === "code") &&
			displayData?.file_id &&
			activeHistory.isNewestVersion
		)
	}, [
		isReadonlyPreview,
		isMediaScenario,
		setIsEditMode,
		allowEdit,
		isMobile,
		saveFunction,
		viewMode,
		displayData?.file_id,
		activeHistory.isNewestVersion,
	])

	/** 使用分享按钮可见性控制 Hook */
	const { showDownloadButton, showExportButton } = useShareButtonVisibility({
		allowDownload,
		isMediaScenario,
		isMobile,
		allowEdit,
		isEditMode,
	})

	const { guideTourOpen, setGuideTourOpen, guideTourSteps } = useHTMLGuideTour({
		isMobile,
	})

	// 通知在线编辑按钮已准备好
	useEffect(() => {
		if (showFileEditButton) {
			pubsub.publish(
				PubSubEvents.GuideTourHTMLElementReady,
				HTMLGuideTourElementId.HTMLFileEditButton,
			)
		}
		if (showAIOptimizationButton) {
			pubsub.publish(
				PubSubEvents.GuideTourHTMLElementReady,
				HTMLGuideTourElementId.AIOptimizationButton,
			)
		}
	}, [showFileEditButton, showAIOptimizationButton])

	const headerActionConfig = useMemo<HeaderActionConfig>(
		() => ({
			hideDefaults: isReadonlyPreview
				? ["refresh", "download", "share", "versionMenu", "more"]
				: [],
			customActions: [
				{
					key: "html-server-update",
					zone: "primary",
					visible: () => Boolean(isEditMode && hasServerUpdate),
					render: () => (
						<Button
							variant="secondary"
							size="sm"
							onClick={handleViewServerUpdate}
							className="h-6 gap-1.5 rounded-md px-3 text-xs font-normal shadow-xs"
							data-testid="html-server-update-button"
						>
							<AlertTriangle size={16} className="text-amber-600" />
							<span>{t("ppt.serverUpdateAvailable")}</span>
						</Button>
					),
				},
				{
					key: "html-toolbar-actions",
					zone: "primary",
					visible: () => Boolean(showAIOptimizationButton || showFileEditButton),
					render: () => (
						<div className="flex items-center gap-1">
							{showAIOptimizationButton && !isEditMode && (
								<AIEditButton
									showButtonText
									attachmentList={attachmentList}
									fileId={displayData?.file_id}
									onStartInspector={() => {
										htmlRendererRef.current?.startInspector()
									}}
								/>
							)}
							{showFileEditButton && (
								<FileEditButtons
									isEditMode={isEditMode}
									isSaving={false}
									showButtonText
									onEdit={handleEdit}
									onSave={handleSave}
									onSaveAndExit={handleSaveAndExit}
									onCancel={handleCancel}
								/>
							)}
							{showFileEditButton && !isEditMode && (
								<ActionButton
									icon={
										<Crosshair
											size={16}
											className={cn(isAppendPicking && "animate-pulse")}
										/>
									}
									onClick={() => {
										htmlRendererRef.current?.startInspectorAppend()
									}}
									title={t(
										"topicFiles.aiPickTooltip",
										"点击后选取页面元素，让 AI 对其进行修改",
									)}
									text={t("topicFiles.aiPick", "AI 选取")}
									showText
									className={cn(
										isAppendPicking &&
											"bg-primary/10 text-primary ring-1 ring-primary/30",
									)}
								/>
							)}
						</div>
					),
				},
				{
					key: "html-permission-manager",
					zone: "secondary",
					before: "refresh",
					visible: () => canManageHtmlPermissions,
					render: (context) => (
						<ActionButton
							icon={<ShieldCheck size={16} />}
							onClick={handleOpenHtmlPermissionManager}
							title={t("htmlEditor.permissionManager.open")}
							text={t("htmlEditor.permissionManager.open")}
							showText={context.showButtonText}
							data-testid="html-permission-manager-button"
						/>
					),
				},
				{
					key: "html-export-dropdown",
					zone: "secondary",
					after: "download",
					visible: () => Boolean(!isReadonlyPreview && showExportButton),
					render: (context) => (
						<HtmlExportAction
							handleExportSource={handleExportSource}
							handleExportPDF={handleExportPDF}
							handleExportPPT={handleExportPPT}
							handleExportPptx={handleExportPptx}
							handleExportImage={handleExportImage}
							handleExportRasterPdf={handleExportRasterPdf}
							isExporting={isExporting}
							supportPPT={isInPPTMode}
							showButtonText={context.showButtonText}
							showExportPptx={isConvertibleFile(displayData, ["html"])}
							showExportImage={isConvertibleFile(displayData, ["html"])}
							showExportRasterPdf
						/>
					),
				},
			],
		}),
		[
			attachmentList,
			displayData?.file_id,
			handleCancel,
			handleEdit,
			handleExportPDF,
			handleExportPPT,
			handleExportPptx,
			handleExportImage,
			handleExportRasterPdf,
			handleExportSource,
			handleSave,
			handleSaveAndExit,
			handleViewServerUpdate,
			hasServerUpdate,
			isExporting,
			isEditMode,
			isInPPTMode,
			isReadonlyPreview,
			showAIOptimizationButton,
			showExportButton,
			showFileEditButton,
			isAppendPicking,
			canManageHtmlPermissions,
			handleOpenHtmlPermissionManager,
			isDataAnalysis,
			htmlIsDeleted,
			hasHtmlPermissionDeclarations,
			t,
		],
	)

	const headerContext = {
		type,
		onFullscreen,
		onDownload: handleDownload,
		isFromNode,
		isFullscreen,
		viewMode,
		onViewModeChange,
		onCopy: (targetFileVersion?: number) =>
			onCopy?.(
				targetFileVersion || activeHistory.fileVersionsList[0]?.version,
				displayData?.file_id,
			),
		fileContent: fileContent || processedContent,
		currentFile,
		detailMode,
		showDownload: showDownloadButton && !showExportButton,
		isEditMode,
		fileVersion: activeHistory.fileVersion,
		isNewestFileVersion: activeHistory.isNewestVersion,
		showRefreshButton: true,
		changeFileVersion: activeHistory.changeFileVersion,
		fileVersionsList: activeHistory.fileVersionsList,
		handleVersionRollback: activeHistory.handleVersionRollback,
		quitEditMode,
		allowEdit,
		attachments,
		actionConfig: headerActionConfig,
		onCompareVersion: handleCompareVersion,
		extraMoreMenuItems:
			!isDataAnalysis && !isCodeViewMode
				? [
						{
							key: "dev-console-toggle",
							label: (
								<div className="flex items-center gap-1.5 text-sm">
									<Terminal size={16} />
									<span>
										{devConsoleEnabled
											? t("stylePanel.closeDevConsole")
											: t("stylePanel.openDevConsole")}
									</span>
								</div>
							),
							onClick: handleDevConsoleToggle,
						},
					]
				: [],
	}

	return (
		<div
			className={cx(styles.htmlContainer, className, {
				[styles.immersiveHtmlContainer]: isImmersiveLayout,
				[styles.documentFlowHtmlContainer]: documentFlowFullscreen,
			})}
		>
			{showFileHeader && <CommonHeaderV2 {...headerContext} />}
			{activeHistory.loading ? (
				documentFlowFullscreen ? (
					<div className="min-h-dvh" />
				) : (
					<Flex
						justify="center"
						align="center"
						style={{
							height: "100%",
							width: "100%",
							backgroundColor: "white",
						}}
					>
						<MagicSpin spinning />
					</Flex>
				)
			) : isCodeViewMode ? (
				<div className={styles.htmlBody}>
					<CodeEditor
						content={data?.content || ""}
						fileName={data?.file_name || data?.title || "file.html"}
						isEditMode={isEditMode}
						onChange={(value) => setEditingCodeContent(value)}
						height="100%"
						showLineNumbers={true}
						theme="light"
					/>
				</div>
			) : (
				<div
					className={cx(styles.previewContainerBase, {
						[styles.phoneModeContainer]: shouldUsePhonePreviewFrame,
						[styles.immersivePreviewContainer]: isImmersiveLayout,
						[styles.documentFlowPreviewContainer]: documentFlowFullscreen,
					})}
				>
					<div
						className={cx(styles.previewInnerBase, styles.htmlBody, "relative", {
							[styles.phoneModeInner]: shouldUsePhonePreviewFrame,
							[styles.immersivePreviewInner]: isImmersiveLayout,
							[styles.documentFlowHtmlBody]: documentFlowFullscreen,
							[styles.documentFlowPreviewInner]: documentFlowFullscreen,
						})}
					>
						{isDataAnalysis ? (
							<DashboardIsolatedHTMLRenderer
								key={`dashboard-html-${dashboardDataJsFile?.file_id || "none"}-${activeHistory.previewRevision}`}
								content={processedContent}
								className={className}
								isEditMode={isEditMode || false}
								dashboardRenderMode={
									viewMode === "phone"
										? "mobile"
										: viewMode === "desktop"
											? "desktop"
											: "auto"
								}
								onSaveReady={onSaveReady as (triggerSave: () => void) => void}
								attachments={attachments}
								attachmentList={attachmentList}
								currentFileId={displayData?.file_id}
								currentFileName={data?.file_name}
								projectId={selectedProject?.id}
								topicId={selectedProject?.current_topic_id}
							/>
						) : htmlIsDeleted ? (
							<Deleted data={displayData} showHeader={false} />
						) : (
							<>
								<IsolatedHTMLRenderer
									ref={htmlRendererRef}
									key={`html-${renderKey}`}
									content={processedContent}
									rawSourceCode={data?.content}
									sandboxType="iframe"
									isPptRender={isInPPTMode}
									scaleContentDimensions={scaleContentDimensions}
									isFullscreen={isFullscreen}
									documentFlowFullscreen={documentFlowFullscreen}
									documentFlowContentHeight={documentFlowContentHeight}
									isEditMode={isEditMode}
									saveEditContent={saveEditContent}
									onSaveReady={onSaveReady}
									fileId={displayData?.file_id}
									virtualStorageMarkerId={virtualStorageMarkerId}
									filePathMapping={filePathMapping}
									openNewTab={openNewTab}
									htmlRelativeFolderPath={
										currentHtmlFileInfo.htmlRelativeFolderPath
									}
									selectedProject={selectedProject}
									devConsoleEnabled={devConsoleEnabled}
									permissionController={htmlPermissionController}
									attachmentList={attachmentList}
									isPlaybackMode={isPlaybackMode}
									onRenderReady={handlePreviewRenderReady}
									onContentMetrics={(
										metrics: IsolatedHTMLRendererContentMetrics,
									) => {
										if (!documentFlowFullscreen) return
										const nextHeight = Math.ceil(metrics.contentHeight)
										if (!Number.isFinite(nextHeight) || nextHeight <= 0) return

										setDocumentFlowContentHeight((currentHeight) =>
											currentHeight === nextHeight
												? currentHeight
												: nextHeight,
										)
									}}
									onDevConsoleClose={() => updateDevConsoleEnabled(false)}
									onAppendPickingChange={setIsAppendPicking}
								/>
								{/* 跨域 shell 渲染期间用 loading 覆盖层填补"数据已就绪但 iframe 内容未画出"的空窗 */}
								{!isPreviewRenderReady && !documentFlowFullscreen && (
									<Flex
										justify="center"
										align="center"
										className="absolute inset-0 z-10 bg-white dark:bg-[#1c1c1c]"
									>
										<MagicSpin spinning />
									</Flex>
								)}
							</>
						)}
					</div>
				</div>
			)}
			{/* 底部 */}
			{showFooter && !isReadonlyPreview && (
				<CommonFooter
					fileVersion={activeHistory.fileVersion}
					changeFileVersion={activeHistory.changeFileVersion}
					fileVersionsList={activeHistory.fileVersionsList}
					handleVersionRollback={activeHistory.handleVersionRollback}
					quitEditMode={quitEditMode}
					allowEdit={allowEdit}
					isEditMode={isEditMode}
				/>
			)}

			<Tour
				steps={guideTourSteps}
				open={guideTourOpen}
				onClose={() => setGuideTourOpen(false)}
				gap={{
					radius: 8,
				}}
			/>
			{permissionManagerOpen && hasHtmlPermissionDeclarations ? (
				<Suspense fallback={null}>
					<HtmlPermissionManagerDialog
						open={permissionManagerOpen}
						onOpenChange={setPermissionManagerOpen}
						permissionRevision={permissionRevision}
						getPermissionSnapshot={getPermissionSnapshot}
						onAuthorize={preauthorizeHtmlPermission}
						onRevoke={revokeHtmlPermission}
						onUpdateTtl={updateHtmlPermissionTtl}
						onRevokeAll={revokeAllHtmlPermissions}
					/>
				</Suspense>
			) : null}
			<AlertDialog
				open={showSaveWithUpdateConfirmDialog}
				onOpenChange={handleSaveConflictDialogChange}
			>
				<AlertDialogContent data-testid="html-save-with-update-dialog">
					<AlertDialogHeader>
						<AlertDialogTitle>{t("ppt.saveWithServerUpdateTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("ppt.saveWithServerUpdate")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={handleDismissSaveWithUpdate}>
							{t("common.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction onClick={handleConfirmSaveWithUpdate}>
							{t("common.save")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{isCodeViewMode ? (
				<CodeVersionCompareDialog
					open={showVersionCompareDialog}
					onOpenChange={setShowVersionCompareDialog}
					currentContent={currentEditingContent}
					serverContent={actualServerContent}
					fileName={versionCompareFileName}
					onUseMyVersion={() => handleAcceptMyVersion()}
					onUseServerVersion={() => handleAcceptServerVersion()}
				/>
			) : (
				<VersionCompareDialog
					open={showVersionCompareDialog}
					onOpenChange={setShowVersionCompareDialog}
					currentContent={currentEditingContent}
					serverContent={actualServerContent}
					onUseMyVersion={handleAcceptMyVersion}
					onUseServerVersion={handleAcceptServerVersion}
					filePathMapping={filePathMapping}
					fileId={displayData?.file_id}
					openNewTab={openNewTab}
					selectedProject={selectedProject}
					attachmentList={attachmentList}
				/>
			)}

			{/* 历史版本对比弹窗；isPptRender 与单页预览一致，PPT 项目内启用缩放 */}
			{compareHistoryVersion && (
				<HistoryVersionCompareDialog
					open={showHistoryCompareDialog}
					onOpenChange={setShowHistoryCompareDialog}
					latestContent={processedContent}
					historyContent={compareHistoryContent}
					historyVersion={compareHistoryVersion}
					fileVersionsList={activeHistory.fileVersionsList}
					onUseHistoryVersion={handleUseHistoryVersionFromCompare}
					onUseLatestVersion={handleUseLatestVersionFromCompare}
					onSwitchHistoryVersion={handleSwitchHistoryVersion}
					filePathMapping={filePathMapping}
					fileId={displayData?.file_id}
					openNewTab={openNewTab}
					selectedProject={selectedProject}
					attachmentList={attachmentList}
					isPptRender={isInPPTMode}
				/>
			)}
		</div>
	)
})
