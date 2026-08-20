import type { ReactNode, MouseEvent } from "react"
import MagicFileIcon from "@/components/base/MagicFileIcon"

export interface FileReferenceProps {
	label: ReactNode
	fileType?: string
	title?: string
	disabled?: boolean
	onClick?: (event: MouseEvent<HTMLSpanElement>) => void
}

export function getFileExtensionFromPath(path: string): string {
	const fileName = path.split(/[\\/]/).pop() || ""
	const extension = fileName.split(".").pop()
	return extension && extension !== fileName ? extension : ""
}

export function FileReference({
	label,
	fileType,
	title,
	disabled = false,
	onClick,
}: FileReferenceProps) {
	return (
		<span
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
			<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
		</span>
	)
}
