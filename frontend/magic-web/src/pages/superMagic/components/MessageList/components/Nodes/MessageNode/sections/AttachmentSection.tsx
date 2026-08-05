import { memo, useMemo, type MouseEvent } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"
import { IconChevronDown, IconChevronRight, IconDownload, IconEye } from "@tabler/icons-react"
import MagicFileIcon from "@/components/base/MagicFileIcon"
import MagicIcon from "@/components/base/MagicIcon"
import { cn } from "@/lib/utils"
import { Attachment } from "@/pages/superMagic/components/MessageList/components/MessageAttachment"
import type { AttachmentProps } from "@/pages/superMagic/components/MessageList/components/MessageAttachment/type"
import { findAttachmentByPath } from "@/pages/superMagic/components/MessageList/components/Text/components/Markdown/parser/helper"
import {
	buildFilePathAttachments,
	openFileByPath,
	type FilePathAttachment,
} from "@/pages/superMagic/components/MessageList/utils/attachmentByFilePath"
import { openMessageFile } from "@/pages/superMagic/components/MessageList/utils/openMessageFile"
import { superMagicStore } from "@/pages/superMagic/stores"
import projectFilesStore from "@/stores/projectFiles"
import { useMessageViewState } from "@/pages/superMagic/components/MessageList/view-state/MessageViewStateContext"
import { useFilePathAttachmentDownload } from "@/pages/superMagic/components/MessageList/components/MessageAttachment/hooks/useFilePathAttachmentDownload"

interface AttachmentSectionProps {
	node?: Record<string, unknown>
	fallbackNode?: { attachments?: unknown }
	prevSuperMessageId?: string
	onFileClick?: (fileItem: unknown) => void
	onSelectDetail?: (detail: unknown) => void
}

export const AttachmentSection = observer(function AttachmentSection({
	node,
	fallbackNode,
	prevSuperMessageId,
	onFileClick: handleFileClick,
	onSelectDetail,
}: AttachmentSectionProps) {
	const attachments = Array.isArray(node?.attachments)
		? (node.attachments as AttachmentProps[])
		: Array.isArray(fallbackNode?.attachments)
			? (fallbackNode.attachments as AttachmentProps[])
			: []
	const rawFilePathAttachments = useMemo(() => {
		if (!prevSuperMessageId) return []
		const prevMessageNode = superMagicStore.getMessageNode(prevSuperMessageId) as
			Record<string, unknown> | undefined
		const prevContent =
			typeof prevMessageNode?.content === "string" ? prevMessageNode.content : ""
		return prevContent ? buildFilePathAttachments(prevContent) : []
	}, [prevSuperMessageId])
	const filePathAttachments = rawFilePathAttachments.filter((attachment) => {
		const found = findAttachmentByPath(
			projectFilesStore.workspaceFilesList,
			attachment.filePath,
		)
		return Boolean(found && found.type !== "directory" && !found.is_directory)
	})
	const onFileClick = useMemoizedFn((item?: unknown) => {
		openMessageFile(item)
		onSelectDetail?.(item)
	})

	if (filePathAttachments.length > 0) {
		return <FilePathAttachmentList attachments={filePathAttachments} />
	}
	if (attachments.length === 0) return null

	return (
		<Attachment
			attachments={attachments}
			onSelectDetail={onFileClick}
			onFileClick={handleFileClick}
		/>
	)
})

interface FilePathAttachmentListProps {
	attachments: FilePathAttachment[]
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
								<MagicFileIcon
									type={attachment.fileExt}
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
