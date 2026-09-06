import type { ReactNode, MouseEvent } from "react"
import MagicFileIcon from "@/components/base/MagicFileIcon"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"

export interface FileReferenceProps {
	label: ReactNode
	href?: string
	fileType?: string
	title?: string
	disabled?: boolean
	mentionAttrs?: TiptapMentionAttributes
	onClick?: (event: MouseEvent<HTMLSpanElement>) => void
}

export function getFileExtensionFromPath(path: string): string {
	const fileName = path.split(/[\\/]/).pop() || ""
	const extension = fileName.split(".").pop()
	return extension && extension !== fileName ? extension : ""
}

export function FileReference({
	label,
	href,
	fileType,
	title,
	disabled = false,
	mentionAttrs,
	onClick,
}: FileReferenceProps) {
	const canDrag = !disabled && Boolean(mentionAttrs)
	return (
		<span
			data-file-reference={href}
			draggable={false}
			data-magic-editor-node={canDrag || undefined}
			data-magic-node-type={canDrag ? "mention" : undefined}
			data-magic-node-attrs={canDrag ? JSON.stringify(mentionAttrs) : undefined}
			aria-disabled={disabled || undefined}
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
			<MagicFileIcon type={fileType} size={16} className="shrink-0" />
			<span
				data-file-reference-label
				className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
			>
				{label}
			</span>
		</span>
	)
}
