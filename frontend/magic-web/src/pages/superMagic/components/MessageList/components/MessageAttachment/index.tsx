import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { FileResourceIcon } from "@/pages/superMagic/components/TopicFilesButton/components/FileResourceIcon"
import { resolveFilePresentation } from "@/pages/superMagic/components/TopicFilesButton/utils/file-presentation"
import { getFileType } from "@/pages/superMagic/utils/handleFIle"
import { useState } from "react"
import type { AttachmentProps } from "./type"
import MagicIcon from "@/components/base/MagicIcon"
import { IconChevronDown, IconChevronRight, IconDownload, IconEye } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import {
	isMagicProjectConfigFile,
	resolveMagicProjectAttachment,
	type MagicProjectAttachmentFile,
} from "./utils"
import { isEmpty } from "lodash-es"
import { cn } from "@/utils/cn"
import { useIsMobile } from "@/hooks/useIsMobile"
import { openMessageFile } from "../../utils/openMessageFile"
import { useMessageAttachmentDownload } from "./hooks/useMessageAttachmentDownload"
import { observer } from "mobx-react-lite"
import { useMessageListProjectFilesStore } from "../../context"
import { detectContentTypeRender } from "@/pages/superMagic/components/Detail/components/FilesViewer/utils/preview"

export const Attachment = observer(function Attachment({
	attachments,
	onSelectDetail,
	onFileClick,
	className,
}: {
	attachments?: Array<AttachmentProps>
	onSelectDetail: any
	onFileClick?: (fileItem: any) => void
	className?: string
}) {
	const { t } = useTranslation("super")
	const resolvedProjectFilesStore = useMessageListProjectFilesStore()
	const isMobile = useIsMobile()
	const handleDownload = useMessageAttachmentDownload(attachments)
	const [expanded, setExpanded] = useState(false)

	const toggleExpanded = (e: any) => {
		e.stopPropagation()
		setExpanded(!expanded)
	}

	const displayedAttachments =
		expanded || !attachments || attachments.length < 4 ? attachments : attachments.slice(0, 4)

	const show = Array.isArray(attachments) && attachments.length > 0
	const resolveMagicProject = (item: MagicProjectAttachmentFile) =>
		resolveMagicProjectAttachment(
			item,
			resolvedProjectFilesStore?.workspaceFilesList ?? [],
			resolvedProjectFilesStore?.workspaceFileTree ?? [],
		)

	const handleOpenFile = (item: any) => {
		const fileName = item.display_filename || item.file_name || item.filename
		const magicProjectResolution = isMagicProjectConfigFile(fileName)
			? resolveMagicProject(item)
			: undefined
		const openTarget = magicProjectResolution?.projectDirectory || item

		if (!isMobile && openTarget.file_id) {
			openMessageFile(openTarget)
			return
		}

		if (onFileClick && openTarget.file_id) {
			onFileClick(openTarget)
			return
		}

		const contentTypeConfig = detectContentTypeRender(openTarget)
		const type = contentTypeConfig?.detailType || getFileType(openTarget.file_extension)
		if (type) {
			onSelectDetail?.({
				type,
				data: {
					...openTarget,
					file_name: magicProjectResolution?.projectName || fileName,
					file_extension: openTarget.file_extension,
					file_id: openTarget.file_id,
					display_config:
						magicProjectResolution?.displayConfig || openTarget.display_config,
					...(contentTypeConfig?.dataTransformer
						? contentTypeConfig.dataTransformer(openTarget)
						: {}),
				},
				currentFileId: openTarget.file_id,
			})
		} else {
			onSelectDetail?.({
				type: "empty",
				data: {
					text: t("ui.filePreviewNotSupported"),
				},
			})
		}
	}
	const getMetaDataName = (item: any) => {
		return item?.name ? `${item?.name}` : null
	}
	if (!show) return null
	return (
		<div className={cn("flex w-full flex-col rounded-md", className)}>
			<div
				className={cn(
					"flex items-center gap-1",
					attachments.length > 4 && "cursor-pointer",
				)}
				onClick={(e) => {
					if (attachments.length > 4) {
						toggleExpanded(e)
					}
				}}
				data-testid="toggle-expanded"
			>
				<div className="mr-1 text-sm font-medium text-foreground">
					{t("ui.attachments", { count: attachments.length })}
				</div>
				{attachments.length > 4 &&
					(expanded ? (
						<IconChevronDown className="size-[18px] shrink-0 text-foreground" />
					) : (
						<IconChevronRight className="size-[18px] shrink-0 text-foreground" />
					))}
			</div>
			{!!displayedAttachments?.length && (
				<div className="mt-2 flex flex-wrap gap-2">
					{displayedAttachments?.map((item: AttachmentProps) => {
						const { display_config } = item
						const isFolder = item.file_extension === ""
						const fileName = item.display_filename || item.file_name || item.filename
						const magicProjectResolution = isMagicProjectConfigFile(fileName)
							? resolveMagicProject(item)
							: undefined
						const attachmentDisplayConfig =
							magicProjectResolution?.displayConfig || display_config
						const attachmentName =
							magicProjectResolution?.projectName ||
							getMetaDataName(display_config) ||
							fileName
						return (
							<div
								key={item.file_id}
								className="w-full cursor-pointer"
								onClick={(e) => {
									if (isFolder && !attachmentDisplayConfig) {
										return
									}
									e.stopPropagation()
									handleOpenFile(item)
								}}
								data-testid="handle-open-file"
							>
								<div
									className={cn(
										"flex items-center gap-2 rounded-[12px] p-2.5 transition-all duration-300",
										"bg-fill",
										"hover:bg-fill-secondary",
									)}
								>
									<FileResourceIcon
										presentation={resolveFilePresentation(
											(magicProjectResolution?.projectDirectory as
												| AttachmentItem
												| undefined) ?? {
												...item,
												is_directory: item.is_directory ?? isFolder,
											},
											{
												context:
													resolvedProjectFilesStore.filePresentationContext,
												index: resolvedProjectFilesStore.filePresentationIndex,
											},
										)}
										size={24}
										className="shrink-0"
										folderTestId="message-attachment-image"
									/>

									<span
										className={cn(
											"mr-2 flex-1 text-foreground",
											"min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
										)}
									>
										{attachmentName}
									</span>
									<MagicIcon
										className="shrink-0 cursor-pointer text-muted-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground/80"
										onClick={(e: any) => {
											e.stopPropagation()
											handleOpenFile(item)
										}}
										component={IconEye}
										stroke={2}
										size={18}
									/>
									{isEmpty(attachmentDisplayConfig) && (
										<MagicIcon
											className="shrink-0 cursor-pointer text-muted-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground/80"
											onClick={(e: any) => {
												e.stopPropagation()
												handleDownload(item.file_id)
											}}
											component={IconDownload}
											stroke={2}
											size={18}
										/>
									)}
								</div>
							</div>
						)
					})}
					{!expanded && attachments && attachments.length > 4 && (
						<div
							className={cn(
								"w-full cursor-pointer rounded-md p-1 text-center",
								"border border-border text-sm font-normal text-foreground",
								"hover:bg-blue-50 dark:hover:bg-blue-500/10",
							)}
							onClick={toggleExpanded}
							data-testid="toggle-expanded-2"
						>
							{t("ui.expandAllFiles")} ({attachments.length})
						</div>
					)}
				</div>
			)}
		</div>
	)
})
