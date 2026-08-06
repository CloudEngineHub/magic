import Render from "@/pages/superMagic/components/Detail/Render"
import { DetailType, type DetailData } from "@/pages/superMagic/components/Detail/types"
import { correctDetailType } from "@/pages/superMagic/components/Detail/components/FilesViewer/utils/preview"
import { Toast } from "antd-mobile"
import type { Ref } from "react"
import {
	forwardRef,
	memo,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useState,
} from "react"
import { useTranslation } from "react-i18next"
import { useDetailActions } from "@/pages/superMagic/components/Detail/hooks/useDetailActions"
import { isEmpty } from "lodash-es"
import { useLocation } from "react-router"
import { copyFileContent } from "@/pages/superMagic/utils/share"
import { getFileType } from "@/pages/superMagic/utils/handleFIle"
import { useMemoizedFn } from "ahooks"
import MagicFileIcon from "@/components/base/MagicFileIcon"
import { Flex } from "antd"
import ToolIcon from "@/pages/superMagic/components/MessageList/components/Tool/components/ToolIcon"
import { getAttachmentExtension } from "@/pages/superMagic/components/MessageList/components/MessageAttachment/utils"
import { BookOpen, X } from "lucide-react"
import IconTerminal from "@/pages/superMagic/assets/svg/terminal.svg"
import PDFIcon from "@/pages/superMagic/assets/file_icon/pdf.svg"
import CommonFileIcon from "@/pages/superMagic/assets/svg/file.svg"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { Topic, ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { useIsMobile } from "@/hooks/useIsMobile"
import MagicModal from "@/components/base/MagicModal"
import MagicPopup from "@/components/base-mobile/MagicPopup"
import { cn } from "@/lib/utils"

/** Keep the preview at a stable viewport height while overriding MagicPopup's auto sizing. */
const MOBILE_PREVIEW_SHEET_CLASSNAME = cn(
	"flex flex-col overflow-hidden rounded-t-[14px] border-0 bg-background p-0",
	"!h-[98dvh] !max-h-[calc(100dvh-var(--safe-area-inset-top)-0.5rem)]",
	"data-[vaul-drawer-direction=bottom]:!mt-[max(0.5rem,var(--safe-area-inset-top))]",
)

/** Body must stay flex + hidden overflow so Render fills the sheet below actionHeader. */
const MOBILE_PREVIEW_BODY_CLASSNAME =
	"flex min-h-0 flex-1 flex-col !max-h-none overflow-hidden !overflow-hidden bg-background p-0"
const PREVIEW_MOBILE_FULLSCREEN_CLASSNAME =
	"!h-[100dvh] !max-h-none !rounded-none data-[vaul-drawer-direction=bottom]:!mt-0"

const PREVIEW_SHARE_CONTAINER_CLASSNAME = "w-full overflow-hidden"
const PREVIEW_SHARE_IMMERSIVE_CLASSNAME =
	"fixed inset-0 z-[1101] !mt-0 h-[100dvh] w-screen overflow-hidden bg-transparent"
const PREVIEW_MODAL_CLASSNAME = "!w-[80vw]"
const PREVIEW_MODAL_FULLSCREEN_CLASSNAME =
	"!top-0 !left-0 !right-0 !m-0 !h-[100dvh] !max-h-[100dvh] !w-screen !max-w-none !pb-0"
const PREVIEW_MODAL_CONTENT_FULLSCREEN_CLASSNAME =
	"!flex !h-[100dvh] !max-h-[100dvh] flex-col overflow-hidden !rounded-none"
const PREVIEW_MODAL_BODY_CLASSNAME = "!h-[80vh] !w-[80vw] !p-0 overflow-hidden rounded-b-xl"
const PREVIEW_MODAL_BODY_FULLSCREEN_CLASSNAME = "!h-full !w-full !max-h-none !rounded-none"
const PREVIEW_MODAL_BODY_WRAPPER_CLASSNAME =
	"flex h-full flex-auto flex-col overflow-x-hidden overflow-y-auto"
const PREVIEW_MOBILE_BOTTOM_GAP_CLASSNAME = "!pb-[calc(56px+var(--safe-area-inset-bottom))]"
import { getPreviewDetailDisplayName, isKnowledgeSearchPreviewDetail } from "./headerMeta"

const OFFICE_DETAIL_TYPES: DetailType[] = [
	DetailType.Docx,
	DetailType.Doc,
	DetailType.Excel,
	DetailType.PowerPoint,
]

export interface PreviewDetail<T extends keyof DetailData = keyof DetailData> {
	type: T
	data: DetailData[T]
	currentFileId: string
	isFromNode?: boolean
	// 后面需要跟着项目走
	topicId?: string
	name?: string
}

export interface PreviewDetailPopupRef {
	open: (
		options: PreviewDetail,
		attachmentTree: AttachmentItem[],
		attachmentList: AttachmentItem[],
	) => void
}

interface PreviewDetailPopupProps {
	setUserSelectDetail: (detail: PreviewDetail | null) => void
	onClose?: () => void
	selectedTopic?: Topic | null
	isFileShare?: boolean
	enableImmersiveShareChrome?: boolean
	isImmersiveFullscreen?: boolean
	selectedProject?: ProjectListItem | null
	onOpenNewPopup?: (
		detail: PreviewDetail,
		attachmentTree: AttachmentItem[],
		attachmentList: AttachmentItem[],
	) => void
	projectId?: string
	// 是否允许下载（用于分享页面权限控制）
	allowDownload?: boolean
	hideHeader?: boolean
	showFileHeader?: boolean
	forceFullscreenMode?: boolean
	/** Allows pure-share preview content to expand into the browser page. */
	documentFlowFullscreen?: boolean
	allowEdit?: boolean
	onPreviewFileChange?: (fileId: string | null) => void
	onPreviewFullscreenChange?: (isFullscreen: boolean) => void
}

function PreviewDetailPopup(props: PreviewDetailPopupProps, ref: Ref<PreviewDetailPopupRef>) {
	const {
		selectedTopic,
		isFileShare,
		enableImmersiveShareChrome,
		isImmersiveFullscreen,
		selectedProject,
		onOpenNewPopup,
		projectId = "",
		allowDownload,
		hideHeader: hideHeaderProp,
		showFileHeader,
		forceFullscreenMode,
		documentFlowFullscreen = false,
		allowEdit,
		onPreviewFileChange,
		onPreviewFullscreenChange,
	} = props

	const isMobile = useIsMobile()
	const { pathname, search } = useLocation()

	// 检查 URL 中是否有 hideHeader 参数。显式 props 优先，用于 pure_mode 等配置驱动场景。
	const hideHeader = useMemo(() => {
		if (hideHeaderProp !== undefined) return hideHeaderProp
		const urlSearchParams = new URLSearchParams(search)
		return urlSearchParams.get("hideHeader") === "true"
	}, [hideHeaderProp, search])

	const { t } = useTranslation("super")
	const [previewDetail, setPreviewDetail] = useState<PreviewDetail>()
	const [visible, setVisible] = useState(false)
	const [attachments, setAttachments] = useState<AttachmentItem[]>([])
	const [attachmentList, setAttachmentList] = useState<AttachmentItem[]>([])
	const [userSelectDetail, setUserDetail] = useState<PreviewDetail>()
	// New state for ActionButtons functionality
	const [viewMode, setViewMode] = useState<"code" | "desktop" | "phone">("desktop")
	const [favoriteFiles, setFavoriteFiles] = useState<Set<string>>(new Set())

	const open = useCallback(
		(
			options: PreviewDetail,
			attachmentTree: AttachmentItem[],
			attachmentList: AttachmentItem[],
		) => {
			setPreviewDetail(options)
			setAttachments(attachmentTree || [])
			setAttachmentList(attachmentList || [])
			setUserDetail(options)
			setVisible(true)
		},
		[],
	)

	const onlyUpdateDetail = useCallback(
		(
			options: PreviewDetail,
			attachmentTree: AttachmentItem[],
			attachmentList: AttachmentItem[],
		) => {
			if (options.isFromNode && previewDetail?.isFromNode) {
				setPreviewDetail(options)
				setAttachments(attachmentTree || [])
				setAttachmentList(attachmentList || [])
				setUserDetail(options)
			}
		},
		[previewDetail?.isFromNode],
	)

	// Handle view mode change between code, desktop and phone
	const handleViewModeChange = useCallback((mode: "code" | "desktop" | "phone") => {
		setViewMode(mode)
	}, [])

	useEffect(() => {
		if (previewDetail?.name === "read_file" || previewDetail?.name === "read_files") {
			setViewMode("code")
		}
	}, [previewDetail?.name])

	// Handle copy functionality for files
	const handleCopy = useCallback(
		async (fileContent?: string, fileVersion?: number, fileId?: string) => {
			copyFileContent(
				attachmentList,
				t,
				fileId || previewDetail?.data?.file_id || "",
				fileContent,
				fileVersion,
			)
		},
		[attachmentList, t, previewDetail?.data?.file_id],
	)

	// Handle share functionality for files
	const handleShare = useCallback(() => {
		// TODO: Implement actual share functionality with your share modal/system
		console.log("Sharing file:", previewDetail?.data?.file_name)
		Toast.show(t("common.shareFeatureDevelopment"))
	}, [previewDetail?.data?.file_name, t])

	// Handle favorite/unfavorite functionality
	const handleFavorite = useCallback(() => {
		if (!previewDetail?.currentFileId) return

		setFavoriteFiles((prev) => {
			const newSet = new Set(prev)
			if (newSet.has(previewDetail.currentFileId)) {
				newSet.delete(previewDetail.currentFileId)
				Toast.show(t("common.removeFavoriteSuccess"))
			} else {
				newSet.add(previewDetail.currentFileId)
				Toast.show(t("common.addFavoriteSuccess"))
			}
			return newSet
		})
	}, [previewDetail?.currentFileId, t])

	useImperativeHandle(ref, () => {
		return {
			open,
			onlyUpdateDetail,
		}
	})

	const { setUserSelectDetail, onClose } = props

	const {
		isFullscreen,
		isFromNode,
		handlePrevious,
		handleNext,
		handleFullscreen,
		handleDownload,
		allFiles,
		currentIndex,
		effectiveAttachments,
		setIsFullscreen,
	} = useDetailActions({
		disPlayDetail: previewDetail,
		setUserSelectDetail,
		attachments,
	})
	const effectiveIsFullscreen = Boolean(forceFullscreenMode) || isFullscreen

	/** Close preview and clear local fullscreen state before the next open. */
	const handleClose = useCallback(() => {
		setIsFullscreen(false)
		onClose?.()
		setVisible(false)
	}, [onClose, setIsFullscreen])

	const isShareRoute = useMemo(() => {
		// 检查是否在分享场景，如果是分享场景则不显示下载全部文件按钮
		return pathname.includes("/share/")
	}, [pathname])

	const openFileTab = useMemoizedFn((file: AttachmentItem) => {
		const fileType = getFileType(file.file_extension || "")
		const newDetail = {
			type: fileType,
			data: {
				file_id: file.file_id || "",
				file_name: file.file_name || file.filename || "",
				file_extension: file.file_extension || "",
				file_url: file.file_url || "",
				file_size: file.file_size || 0,
			},
			currentFileId: file.file_id || "",
		} as PreviewDetail

		// 如果有 onOpenNewPopup 回调，使用它打开新弹层；否则使用 setUserSelectDetail（向后兼容）
		if (onOpenNewPopup) {
			onOpenNewPopup(newDetail, attachments, attachmentList)
		} else {
			setUserSelectDetail?.(newDetail)
		}
	})

	useEffect(() => {
		onPreviewFileChange?.(previewDetail?.currentFileId || null)
	}, [onPreviewFileChange, previewDetail?.currentFileId])

	useEffect(() => {
		onPreviewFullscreenChange?.(effectiveIsFullscreen)
	}, [effectiveIsFullscreen, onPreviewFullscreenChange])

	const RenderComponent = useMemo(() => {
		// 修正 detail 类型（如果 metadata.type 是 design 但 type 是 notSupport，需要修正）
		const correctedPreviewDetail = correctDetailType(previewDetail, {
			attachmentList,
		})
		if (!correctedPreviewDetail?.type) return null

		// 设计太垃，兼容数据格式
		const meta = attachmentList.find(
			(item) => item?.file_id === correctedPreviewDetail?.currentFileId,
		)

		const previewFilePath = meta?.relative_file_path || ""
		return (
			<Render
				key={previewDetail?.currentFileId}
				type={correctedPreviewDetail?.type}
				data={correctedPreviewDetail?.data}
				attachments={effectiveAttachments}
				setUserSelectDetail={setUserSelectDetail}
				currentIndex={currentIndex}
				onPrevious={handlePrevious}
				onNext={handleNext}
				onFullscreen={handleFullscreen}
				onDownload={handleDownload}
				totalFiles={allFiles.length}
				hasUserSelectDetail={!isEmpty(previewDetail)}
				isFromNode={isFromNode}
				onClose={onClose}
				userSelectDetail={userSelectDetail}
				isFullscreen={effectiveIsFullscreen}
				documentFlowFullscreen={documentFlowFullscreen}
				attachmentList={attachmentList}
				display_config={meta?.display_config}
				// New props for ActionButtons functionality
				viewMode={viewMode}
				onViewModeChange={handleViewModeChange}
				onCopy={(fileVersion?: number, fileId?: string) =>
					handleCopy(
						(previewDetail?.data as { content?: string })?.content,
						fileVersion,
						fileId,
					)
				}
				onShare={handleShare}
				onFavorite={handleFavorite}
				fileContent={(previewDetail?.data as { content?: string })?.content || ""}
				isFavorited={favoriteFiles.has(previewDetail?.currentFileId || "")}
				baseShareUrl={`${window.location.origin}/share`}
				currentFile={{
					id: previewDetail?.currentFileId || "",
					name: (previewDetail?.data as { file_name?: string })?.file_name || "",
					type:
						(previewDetail?.data as { file_extension?: string })?.file_extension || "",
					url: (previewDetail?.data as { file_url?: string })?.file_url || "",
					relativeFilePath: previewFilePath,
				}}
				topicId={previewDetail?.topicId || selectedTopic?.id || ""}
				openFileTab={openFileTab}
				activeFileId={previewDetail?.currentFileId || ""}
				selectedProject={selectedProject}
				projectId={selectedProject?.id || projectId}
				isPlaybackMode={!!previewDetail?.isFromNode || false}
				allowDownload={allowDownload}
				allowEdit={allowEdit}
				showFileHeader={showFileHeader ?? !isImmersiveFullscreen}
				// Mobile sheet: MagicPopup shows title; toolbar-only header avoids duplicate chrome.
				headerRenderMode={isMobile ? "actions" : "full"}
				// Mobile preview hides version footer; desktop keeps version selector when allowed.
				showFooter={!isMobile && !effectiveIsFullscreen && !isShareRoute}
				className={
					documentFlowFullscreen
						? "min-h-dvh w-full overflow-visible"
						: effectiveIsFullscreen
							? "h-full min-h-0 w-full flex-1"
							: isMobile
								? "min-h-0 flex-1"
								: undefined
				}
			/>
		)
	}, [
		allFiles.length,
		allowDownload,
		allowEdit,
		attachmentList,
		currentIndex,
		effectiveAttachments,
		favoriteFiles,
		handleCopy,
		handleDownload,
		handleFavorite,
		handleFullscreen,
		handleNext,
		handlePrevious,
		handleShare,
		handleViewModeChange,
		effectiveIsFullscreen,
		isFromNode,
		isImmersiveFullscreen,
		isMobile,
		isShareRoute,
		onClose,
		openFileTab,
		previewDetail,
		projectId,
		selectedProject,
		selectedTopic?.id,
		setUserSelectDetail,
		showFileHeader,
		userSelectDetail,
		viewMode,
		documentFlowFullscreen,
	])

	const displayFileName = useMemo(() => {
		// 修正 detail 类型（如果 metadata.type 是 design 但 type 是 notSupport，需要修正）
		const correctedPreviewDetail = correctDetailType(previewDetail, {
			attachmentList,
		})
		return getPreviewDetailDisplayName(correctedPreviewDetail, t)
	}, [attachmentList, previewDetail, t])

	const isOfficePreview = useMemo(() => {
		const correctedPreviewDetail = correctDetailType(previewDetail, {
			attachmentList,
		})
		return correctedPreviewDetail
			? OFFICE_DETAIL_TYPES.includes(correctedPreviewDetail.type as DetailType)
			: false
	}, [attachmentList, previewDetail])

	if (isFileShare) {
		return (
			<div
				className={cn(
					PREVIEW_SHARE_CONTAINER_CLASSNAME,
					hideHeader ? "h-full" : "mt-[52px] h-[calc(100%_-_52px)]",
					{
						[PREVIEW_SHARE_IMMERSIVE_CLASSNAME]:
							enableImmersiveShareChrome && isImmersiveFullscreen,
					},
				)}
				style={
					documentFlowFullscreen
						? { height: "auto", minHeight: "100dvh", marginTop: 0, overflow: "visible" }
						: undefined
				}
				data-testid="share-preview-detail-popup-root"
			>
				{RenderComponent}
			</div>
		)
	}

	if (isMobile) {
		return (
			<MagicPopup
				visible={visible}
				onClose={handleClose}
				position="bottom"
				title={displayFileName}
				headerVariant={hideHeader ? undefined : "actionHeader"}
				headerTitle={displayFileName}
				headerLeadingAction={
					hideHeader
						? undefined
						: {
								icon: <X className="h-[22px] w-[22px]" />,
								ariaLabel: t("common.close"),
								onClick: handleClose,
								testId: "file-preview-popup-close-button",
							}
				}
				hideDefaultHandle={hideHeader || effectiveIsFullscreen}
				className={cn(
					MOBILE_PREVIEW_SHEET_CLASSNAME,
					effectiveIsFullscreen && PREVIEW_MOBILE_FULLSCREEN_CLASSNAME,
				)}
				bodyClassName={cn(
					MOBILE_PREVIEW_BODY_CLASSNAME,
					isShareRoute && previewDetail?.isFromNode
						? PREVIEW_MOBILE_BOTTOM_GAP_CLASSNAME
						: "rounded-xl rounded-b-none",
				)}
				maskClosable
				data-testid="file-preview-detail-popup-root"
			>
				<div className="flex min-h-0 flex-1 flex-col bg-background">
					{!!previewDetail && visible && <>{RenderComponent}</>}
				</div>
			</MagicPopup>
		)
	}

	return (
		<MagicModal
			open={visible}
			maskClosable
			mask
			onCancel={() => {
				if (effectiveIsFullscreen && !forceFullscreenMode) {
					setIsFullscreen(false)
					return
				}
				handleClose()
			}}
			destroyOnClose={isOfficePreview}
			closable={!effectiveIsFullscreen}
			footer={null}
			title={effectiveIsFullscreen ? undefined : "文件预览"}
			classNames={{
				header: effectiveIsFullscreen ? "hidden" : undefined,
				content: effectiveIsFullscreen
					? PREVIEW_MODAL_CONTENT_FULLSCREEN_CLASSNAME
					: undefined,
				body: cn(
					PREVIEW_MODAL_BODY_CLASSNAME,
					effectiveIsFullscreen && PREVIEW_MODAL_BODY_FULLSCREEN_CLASSNAME,
				),
			}}
			className={cn(
				PREVIEW_MODAL_CLASSNAME,
				effectiveIsFullscreen && PREVIEW_MODAL_FULLSCREEN_CLASSNAME,
			)}
			centered={!effectiveIsFullscreen}
		>
			<div className={PREVIEW_MODAL_BODY_WRAPPER_CLASSNAME}>
				{!!previewDetail && visible && <>{RenderComponent}</>}
			</div>
		</MagicModal>
	)
}

export default memo(forwardRef(PreviewDetailPopup))
