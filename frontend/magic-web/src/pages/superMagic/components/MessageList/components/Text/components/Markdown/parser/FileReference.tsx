import { FileResourceIcon } from "@/pages/superMagic/components/TopicFilesButton/components/FileResourceIcon"
import { resolveFilePresentation } from "@/pages/superMagic/components/TopicFilesButton/utils/file-presentation"
import type { FilePresentation } from "@/pages/superMagic/components/TopicFilesButton/utils/file-presentation"
import type { ReactNode, MouseEvent } from "react"
import { Loader2 } from "lucide-react"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"

export interface FileReferenceProps {
	presentation?: FilePresentation
	label: ReactNode
	href?: string
	fileType?: string
	title?: string
	disabled?: boolean
	loading?: boolean
	isDirectory?: boolean
	mentionAttrs?: TiptapMentionAttributes
	onClick?: (event: MouseEvent<HTMLSpanElement>) => void
}

export function getFileExtensionFromPath(path: string): string {
	const fileName = path.split(/[\\/]/).pop() || ""
	const extension = fileName.split(".").pop()
	return extension && extension !== fileName ? extension : ""
}

export function FileReference({
	presentation,
	label,
	href,
	fileType,
	title,
	disabled = false,
	loading = false,
	isDirectory = false,
	mentionAttrs,
	onClick,
}: FileReferenceProps) {
	const canDrag = !disabled && Boolean(mentionAttrs)
	return (
		<span
			data-file-reference={href}
			draggable={false}
			data-magic-editor-node={canDrag || undefined}
			data-magic-node-type={mentionAttrs ? "mention" : undefined}
			data-magic-node-attrs={mentionAttrs ? JSON.stringify(mentionAttrs) : undefined}
			aria-disabled={disabled || undefined}
			aria-busy={loading || undefined}
			className={[
				"inline-flex max-w-full items-center gap-1 overflow-hidden rounded bg-[#f0f6ff] px-1.5 py-0.5 text-xs font-normal leading-5 text-[#315cec]",
				disabled
					? "cursor-default opacity-60"
					: onClick
						? "cursor-pointer hover:bg-[#e0ecff]"
						: "",
			].join(" ")}
			title={title}
			onClick={disabled ? undefined : onClick}
		>
			{loading ? (
				<Loader2 size={16} className="shrink-0 animate-spin" />
			) : (
				<FileResourceIcon
					presentation={
						presentation ??
						resolveFilePresentation({
							file_extension: fileType,
							is_directory: isDirectory,
						})
					}
					size={16}
					className="shrink-0"
				/>
			)}
			<span
				data-file-reference-label
				className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
			>
				{label}
			</span>
		</span>
	)
}
