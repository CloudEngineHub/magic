import { FileResourceIcon } from "@/pages/superMagic/components/TopicFilesButton/components/FileResourceIcon"
import { resolveFilePresentation } from "@/pages/superMagic/components/TopicFilesButton/utils/file-presentation"
import type { FilePresentation } from "@/pages/superMagic/components/TopicFilesButton/utils/file-presentation"
import { memo, useMemo, type MouseEvent } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"
import { IconChevronDown, IconChevronRight, IconDownload, IconEye } from "@tabler/icons-react"
import MagicIcon from "@/components/base/MagicIcon"
import { cn } from "@/utils/cn"
import { Attachment } from "@/pages/superMagic/components/MessageList/components/MessageAttachment"
import type { AttachmentProps } from "@/pages/superMagic/components/MessageList/components/MessageAttachment/type"
import { normalizeWorkspacePathForComparison } from "@/pages/superMagic/utils/markdownFileReference"
import { useMessageListContext } from "@/pages/superMagic/components/MessageList/context"
import {
	buildFilePathAttachments,
	findFilePathAttachment,
	openFileByPath,
	type FilePathAttachment,
} from "@/pages/superMagic/components/MessageList/utils/attachmentByFilePath"
import { openMessageFile } from "@/pages/superMagic/components/MessageList/utils/openMessageFile"
import { superMagicStore } from "@/pages/superMagic/stores"
import projectFilesStore from "@/stores/projectFiles"
import { useMessageViewState } from "@/pages/superMagic/components/MessageList/view-state/MessageViewStateContext"
import { useFilePathAttachmentDownload } from "@/pages/superMagic/components/MessageList/components/MessageAttachment/hooks/useFilePathAttachmentDownload"
import { resolveAttachmentList } from "@/pages/superMagic/components/MessageList/message-render-contract"

interface AttachmentSectionProps {
	node?: Record<string, unknown>
	fallbackNode?: { attachments?: unknown }
	prevSuperMessageId?: string
	onFileClick?: (fileItem: unknown) => void
	onSelectDetail?: (detail: unknown) => void
	/** Applied to whichever branch renders, so callers never wrap a section that returns null. */
	className?: string
}

export const AttachmentSection = observer(function AttachmentSection({
	node,
	fallbackNode,
	prevSuperMessageId,
	onFileClick: handleFileClick,
	onSelectDetail,
	className,
}: AttachmentSectionProps) {
	const { projectFilesStore: scopedProjectFilesStore } = useMessageListContext()
	const resolvedProjectFilesStore = scopedProjectFilesStore ?? projectFilesStore
	const attachments = resolveAttachmentList(node, fallbackNode) as AttachmentProps[]
	const rawFilePathAttachments = useMemo(() => {
		if (!prevSuperMessageId) return []
		const prevMessageNode = superMagicStore.getMessageNode(prevSuperMessageId) as
			Record<string, unknown> | undefined
		const prevContent =
			typeof prevMessageNode?.content === "string" ? prevMessageNode.content : ""
		return prevContent ? buildFilePathAttachments(prevContent) : []
	}, [prevSuperMessageId])
	const filePathAttachments = rawFilePathAttachments.flatMap((attachment) => {
		const found = findFilePathAttachment(
			resolvedProjectFilesStore.workspaceFilesList,
			attachment,
		)
		if (!found || found.type === "directory" || found.is_directory) return []
		// 文件打开事件使用已匹配的真实路径，不把旧语法编码留给下游猜测。
		const filePath = normalizeWorkspacePathForComparison(
			found.relative_file_path || found.path || attachment.filePath,
		)
		return filePath
			? [
					{
						...attachment,
						filePath,
						presentation: resolveFilePresentation(found, {
							context: resolvedProjectFilesStore.filePresentationContext,
							index: resolvedProjectFilesStore.filePresentationIndex,
						}),
					},
				]
			: []
	})
	const onFileClick = useMemoizedFn((item?: unknown) => {
		openMessageFile(item)
		onSelectDetail?.(item)
	})

	if (filePathAttachments.length > 0) {
		return <FilePathAttachmentList attachments={filePathAttachments} className={className} />
	}
	if (attachments.length === 0) return null

	return (
		<Attachment
			className={className}
			attachments={attachments}
			onSelectDetail={onFileClick}
			onFileClick={handleFileClick}
		/>
	)
})

interface FilePathAttachmentListProps {
	attachments: Array<FilePathAttachment & { presentation: FilePresentation }>
	className?: string
}

const FilePathAttachmentList = memo(function FilePathAttachmentList({
	attachments,
	className,
}: FilePathAttachmentListProps) {
	const { t } = useTranslation("super")
	const [expanded, setExpanded] = useMessageViewState("file-path-attachments-expanded", false)
	const downloadFileByPath = useFilePathAttachmentDownload()

	if (attachments.length === 0) return null

	const toggleExpanded = (event: MouseEvent) => {
		event.stopPropagation()
		setExpanded(!expanded)
	}
	const displayedAttachments =
		expanded || attachments.length < 4 ? attachments : attachments.slice(0, 4)

	return (
		<div className={cn("flex w-full flex-col rounded-md", className)}>
			<div
				className={cn(
					"flex items-center gap-1",
					attachments.length > 4 && "cursor-pointer",
				)}
				onClick={(event) => {
					if (attachments.length > 4) toggleExpanded(event)
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
			{!!displayedAttachments.length && (
				<div className="mt-2 flex flex-wrap gap-2">
					{displayedAttachments.map((attachment) => (
						<div
							key={attachment.filePath}
							className="w-full cursor-pointer"
							onClick={() => openFileByPath(attachment)}
							data-testid="open-file-by-path"
						>
							<div
								className={cn(
									"flex items-center gap-2 rounded-[12px] p-2.5 transition-all duration-300",
									"bg-fill hover:bg-fill-secondary",
								)}
							>
								<FileResourceIcon
									presentation={attachment.presentation}
									size={24}
									className="shrink-0"
								/>
								<span className="mr-2 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-foreground">
									{attachment.fileName}
								</span>
								<MagicIcon
									className="shrink-0 cursor-pointer text-muted-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground/80"
									onClick={(event: MouseEvent) => {
										event.stopPropagation()
										openFileByPath(attachment)
									}}
									component={IconEye}
									stroke={2}
									size={18}
								/>
								<MagicIcon
									className="shrink-0 cursor-pointer text-muted-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground/80"
									onClick={(event: MouseEvent) => {
										event.stopPropagation()
										downloadFileByPath(attachment)
									}}
									component={IconDownload}
									stroke={2}
									size={18}
								/>
							</div>
						</div>
					))}
					{!expanded && attachments.length > 4 && (
						<div
							className={cn(
								"w-full cursor-pointer rounded-md border border-border p-1 text-center text-sm font-normal text-foreground",
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
