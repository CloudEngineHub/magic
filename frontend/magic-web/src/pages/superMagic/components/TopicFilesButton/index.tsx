import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"
import { useStyles } from "./style"
import TopicFilesPanel, { TopicFilesPanelRef } from "./TopicFilesPanel"
import type { AttachmentItem } from "./hooks/types"
import type { PresetFileType } from "./constant"
import type { TopicFileRowDecorationResolver } from "./topic-file-row-decoration.types"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useDownloadVisibility } from "@/pages/superMagic/hooks/useDownloadVisibility"
import magicToast from "@/components/base/MagicToaster/utils"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { mySlidesTemplateAdapter } from "@/pages/superMagic/services/mySlidesTemplateAdapter"
import { buildConvertToSlidesTemplatePayload } from "@/pages/superMagic/utils/slidesTemplateActions"
import type { TopicFilesSpaceConfig } from "./file-space"

export { PRESET_FILE_TYPES, type PresetFileType } from "./constant"
export type {
	TopicFileRowDecoration,
	TopicFileRowDecorationContext,
	TopicFileRowDecorationResolver,
} from "./topic-file-row-decoration.types"

export interface TopicFilesButtonProps {
	className?: string
	title?: string
	/** 是否显示文件树内部标题。 */
	showTitle?: boolean
	attachments?: AttachmentItem[]
	setUserSelectDetail?: (detail: any) => void
	onFileClick?: (fileItem: any) => void
	projectId?: string
	activeFileId?: string | null
	selectedTopic?: any
	allowEdit?: boolean
	// 添加直接更新attachments的回调
	onAttachmentsChange?: (attachments: AttachmentItem[]) => void
	selectedProject?: any
	// 跨项目操作所需的props
	selectedWorkspace?: any
	projects?: any[]
	workspaces?: any[]
	isInProject?: boolean
	// 多选模式变化回调
	onMultiSelectModeChange?: (isMultiSelectMode: boolean) => void
	showMobileActions?: boolean
	// 自定义菜单项过滤器
	filterMenuItems?: (menuItems: any[], item?: AttachmentItem) => any[]
	// 自定义批量下载菜单过滤器
	filterBatchDownloadLayerMenuItems?: (menuItems: any[]) => any[]
	// 是否允许下载（用于分享页面权限控制）
	allowDownload?: boolean
	resolveTopicFileRowDecoration?: TopicFileRowDecorationResolver
	mobileViewVariant?: "default" | "project-detail" | "chat-sheet"
	refreshAttachments?: () => Promise<void> | void
	onSaveSlidesTemplate?: (item: AttachmentItem) => void | Promise<void>
	onConvertToSlidesTemplate?: (item: AttachmentItem) => void
	headerTrailingAction?: ReactNode
	/** 文件树所属空间及其能力配置。 */
	spaceConfig?: TopicFilesSpaceConfig
	/** 判断节点是否允许参与移动和多选等变更操作。 */
	isItemSelectable?: (item: AttachmentItem) => boolean
	/** 特殊文件空间允许操作的固定根目录。 */
	operationRoot?: AttachmentItem
}

export interface TopicFilesButtonRef {
	addFile: (extraType?: PresetFileType) => void
	addFolder: () => void
	uploadFile: () => void
	uploadFolder: () => void
	openBatchMoveByFileIds: (fileIds: string[]) => void
}

const TopicFilesButton = forwardRef<TopicFilesButtonRef, TopicFilesButtonProps>(
	function TopicFilesButton(
		{
			className,
			title,
			showTitle = true,
			attachments = [],
			setUserSelectDetail,
			onFileClick,
			projectId,
			activeFileId,
			selectedTopic,
			allowEdit = true,
			onAttachmentsChange,
			selectedProject,
			selectedWorkspace,
			projects = [],
			workspaces = [],
			isInProject = false,
			onMultiSelectModeChange,
			showMobileActions = false,
			filterMenuItems,
			filterBatchDownloadLayerMenuItems,
			allowDownload,
			resolveTopicFileRowDecoration,
			mobileViewVariant = "default",
			refreshAttachments,
			onSaveSlidesTemplate,
			onConvertToSlidesTemplate,
			headerTrailingAction,
			spaceConfig,
			isItemSelectable,
			operationRoot,
		},
		ref,
	) {
		const { styles, cx } = useStyles()
		const { t } = useTranslation("super")
		const isMobile = useIsMobile()
		const effectiveAllowDownload = useDownloadVisibility(allowDownload !== false, isMobile)
		const panelRef = useRef<TopicFilesPanelRef>(null)
		const handleSaveSlidesTemplate = useMemoizedFn(async (item: AttachmentItem) => {
			if (onSaveSlidesTemplate) {
				await onSaveSlidesTemplate(item)
				return
			}

			if (!mySlidesTemplateAdapter.enabled) {
				magicToast.info(t("mySlidesTemplates.saveUnavailable"))
				return
			}

			const resolvedProjectId = selectedProject?.id || projectId
			const folderId = item.file_id
			if (!resolvedProjectId || !folderId) {
				magicToast.error(t("mySlidesTemplates.saveFailed"))
				return
			}

			try {
				await mySlidesTemplateAdapter.saveFromFolder({
					projectId: resolvedProjectId,
					folderId,
					folderName:
						item.file_name || item.filename || item.name || item.display_filename || "",
				})
				magicToast.success(t("mySlidesTemplates.saveSuccess"))
			} catch {
				magicToast.error(t("mySlidesTemplates.saveFailed"))
			}
		})
		const handleConvertToSlidesTemplate = useMemoizedFn((item: AttachmentItem) => {
			if (onConvertToSlidesTemplate) {
				onConvertToSlidesTemplate(item)
				return
			}
			pubsub.publish(PubSubEvents.Create_New_Topic, buildConvertToSlidesTemplatePayload(item))
		})

		// Expose file operation methods to parent
		useImperativeHandle(ref, () => ({
			addFile: (extraType?: PresetFileType) => {
				panelRef.current?.addFile(extraType)
			},
			addFolder: () => {
				panelRef.current?.addFolder()
			},
			uploadFile: () => {
				panelRef.current?.uploadFile()
			},
			uploadFolder: () => {
				panelRef.current?.uploadFolder()
			},
			openBatchMoveByFileIds: (fileIds: string[]) => {
				panelRef.current?.openBatchMoveByFileIds(fileIds)
			},
		}))

		// Expanded state: use TopicFilesPanel component
		return (
			<div className={cx(styles.container, className)}>
				<TopicFilesPanel
					ref={panelRef}
					className={className}
					title={title}
					showTitle={showTitle}
					attachments={attachments}
					setUserSelectDetail={setUserSelectDetail}
					onFileClick={onFileClick}
					projectId={projectId}
					activeFileId={activeFileId}
					selectedTopic={selectedTopic}
					allowEdit={allowEdit}
					onAttachmentsChange={onAttachmentsChange}
					selectedProject={selectedProject}
					selectedWorkspace={selectedWorkspace}
					projects={projects}
					workspaces={workspaces}
					isInProject={isInProject}
					onMultiSelectModeChange={onMultiSelectModeChange}
					showMobileActions={showMobileActions}
					filterMenuItems={filterMenuItems}
					filterBatchDownloadLayerMenuItems={filterBatchDownloadLayerMenuItems}
					allowDownload={effectiveAllowDownload}
					resolveTopicFileRowDecoration={resolveTopicFileRowDecoration}
					mobileViewVariant={mobileViewVariant}
					refreshAttachments={refreshAttachments}
					onSaveSlidesTemplate={handleSaveSlidesTemplate}
					onConvertToSlidesTemplate={handleConvertToSlidesTemplate}
					headerTrailingAction={headerTrailingAction}
					spaceConfig={spaceConfig}
					isItemSelectable={isItemSelectable}
					operationRoot={operationRoot}
				/>
			</div>
		)
	},
)

export default TopicFilesButton
