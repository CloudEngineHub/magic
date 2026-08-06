import { NodeViewWrapper } from "@tiptap/react"
import { observer } from "mobx-react-lite"
import { useCallback, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import type { MentionNodeViewRendererProps } from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { UploadFileMentionData } from "@/components/business/MentionPanel/types"
import { useIsMobile } from "@/hooks/useIsMobile"
import { cn } from "@/lib/utils"
import { useOptionalMessageEditorStore } from "../../../stores"
import { toDisplayUploadProgress } from "../../../utils/uploadProgress"

function UploadFileMentionNodeView({ attrs, deleteNode, selected }: MentionNodeViewRendererProps) {
	const { t } = useTranslation("super")
	const isMobile = useIsMobile()
	const editorStore = useOptionalMessageEditorStore()
	const uploadData = attrs.data as UploadFileMentionData
	const liveFile = editorStore?.fileUploadStore.getFileById(uploadData.file_id)
	const status = liveFile?.status ?? uploadData.upload_status
	const progress = toDisplayUploadProgress(liveFile?.progress ?? uploadData.upload_progress) ?? 0
	const fileName = liveFile?.name || uploadData.file_name
	const isUploading = status === "init" || status === "uploading"
	const isError = status === "error"

	const handleMouseDown = useCallback((event: MouseEvent) => {
		event.preventDefault()
	}, [])

	const handleRemove = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.preventDefault()
			event.stopPropagation()
			deleteNode?.()
		},
		[deleteNode],
	)

	return (
		<NodeViewWrapper
			as="span"
			// The atomic wrapper only defines the ProseMirror boundary. Visual padding on this
			// element makes the native caret appear inside the mention background at line end.
			className={cn(
				"magic-mention relative !inline-flex max-w-full !overflow-visible !bg-transparent !p-0",
				isMobile ? "align-middle" : "!align-baseline",
			)}
			contentEditable={false}
			data-type={attrs.type}
			data-data={JSON.stringify(attrs.data || {})}
			onMouseDown={handleMouseDown}
		>
			<span
				className={cn(
					"relative inline-flex min-w-0 max-w-[220px] gap-1 overflow-hidden",
					isMobile &&
						"mb-1 items-center rounded-full bg-muted py-0.5 pl-2 pr-1 text-sm text-foreground",
					!isMobile &&
						"h-[18px] items-center rounded bg-primary-10 px-1 leading-none text-primary",
					!isMobile && isUploading && "bg-muted text-muted-foreground",
					selected && "ring-1 ring-primary/40",
					isError && "bg-destructive/10 text-destructive",
				)}
				data-testid="upload-file-mention-visual"
			>
				{isUploading && (
					<span
						className={cn(
							"pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-200 ease-out",
							isMobile ? "bg-primary/10" : "bg-primary/15",
						)}
						style={{ width: `${progress}%` }}
						data-testid="upload-file-mention-progress-background"
					/>
				)}
				<span className="relative z-10 min-w-0 truncate" title={fileName}>
					@{fileName}
				</span>
				{isUploading && (
					<span
						className="relative z-10 shrink-0 text-[0.85em] tabular-nums leading-none text-muted-foreground"
						data-testid="upload-file-mention-progress"
					>
						{progress}%
					</span>
				)}
				{isError && (
					<span className="relative z-10 shrink-0 text-xs">
						{t("fileUpload.uploadFailed")}
					</span>
				)}
				{isMobile && deleteNode && (
					<button
						type="button"
						className="relative z-10 inline-flex size-4 shrink-0 items-center justify-center rounded-full"
						onMouseDown={handleMouseDown}
						onClick={handleRemove}
						aria-label={t("uploadModal.removeFile")}
					>
						<X size={16} />
					</button>
				)}
			</span>
		</NodeViewWrapper>
	)
}

export default observer(UploadFileMentionNodeView)
