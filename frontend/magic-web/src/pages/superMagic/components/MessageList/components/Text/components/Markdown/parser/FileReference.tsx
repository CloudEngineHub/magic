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
			data-testid="markdown-file-reference"
			data-file-reference={href}
			draggable={false}
			data-magic-editor-node={canDrag || undefined}
			data-magic-node-type={mentionAttrs ? "mention" : undefined}
			data-magic-node-attrs={mentionAttrs ? JSON.stringify(mentionAttrs) : undefined}
			aria-disabled={disabled || undefined}
			aria-busy={loading || undefined}
			// Use the filename's baseline for surrounding text; the icon must not supply the flex baseline.
			className={[
				"inline-flex max-w-full items-baseline gap-1 overflow-hidden rounded bg-[#f0f6ff] px-0.5 align-baseline text-xs font-normal text-[#315cec]",
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
				<Loader2 size={16} className="mt-[-0.2em] shrink-0 animate-spin self-center" />
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
					className="mt-[-0.2em] shrink-0 self-center"
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
