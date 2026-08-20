import { NodeViewWrapper } from "@/infrastructure/editors/tiptap/react"
import { memo, useCallback, type MouseEvent } from "react"
import { X } from "lucide-react"
import MagicFileIcon from "@/components/base/MagicFileIcon"
import {
	getMentionDisplayName,
	type MentionNodeViewRendererProps,
} from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { ProjectFileMentionData } from "@/components/business/MentionPanel/types"
import { useIsMobile } from "@/hooks/useIsMobile"

function ProjectFileMentionNodeView({ attrs, deleteNode, selected }: MentionNodeViewRendererProps) {
	const isMobile = useIsMobile()
	const fileData = attrs.data as ProjectFileMentionData
	const displayName = getMentionDisplayName(attrs)
	const fileName = fileData.file_name || displayName
	const fileType = fileData.file_extension || fileName.split(".").pop() || ""

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
			className="magic-mention inline-flex max-w-full align-middle"
			contentEditable={false}
			data-type={attrs.type}
			data-data={JSON.stringify(attrs.data || {})}
			onMouseDown={handleMouseDown}
		>
			<span
				className={[
					"inline-flex min-w-0 max-w-[220px] items-center gap-1 overflow-hidden",
					isMobile
						? "mb-1 rounded-full bg-muted py-0.5 pl-2 pr-1 text-sm text-foreground"
						: "rounded bg-primary-10 px-1 py-0.5 text-primary",
					selected ? "ring-1 ring-primary/40" : "",
				].join(" ")}
				title={fileName}
			>
				<MagicFileIcon type={fileType} size={16} className="shrink-0" />
				<span className="min-w-0 truncate">{fileName}</span>
				{isMobile && deleteNode && (
					<button
						type="button"
						className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground"
						onMouseDown={handleMouseDown}
						onClick={handleRemove}
						aria-label={`remove ${fileName}`}
					>
						<X size={16} />
					</button>
				)}
			</span>
		</NodeViewWrapper>
	)
}

export default memo(ProjectFileMentionNodeView)
