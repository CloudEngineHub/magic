import { ContextHelp } from "@/components/shadcn-composed/context-help"
import { badgeVariants } from "@/components/shadcn-ui/badge"
import { cn } from "@/utils/cn"
import type { AttachmentItem } from "../hooks/types"
import { useSystemFileHelp, type FileHelpPresentation } from "../hooks/useSystemFileHelp"
import {
	isMagicSystemFolder,
	resolveProjectInstructionsFileKind,
} from "../utils/magic-system-folder"

/** 标签只解释用途；点击、键盘和触屏操作不能冒泡为文件打开或目录折叠。 */
export function TopicFileTag({ label, help }: FileHelpPresentation) {
	return (
		<ContextHelp help={help} mode="preview">
			<button
				type="button"
				aria-label={label}
				data-slot="badge"
				className={cn(
					badgeVariants({ variant: "outline" }),
					"min-h-5 max-w-full rounded-md border-border bg-background px-2 py-0.5 text-[10px] font-normal leading-3 text-muted-foreground shadow-none",
				)}
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => event.stopPropagation()}
				onDoubleClick={(event) => event.stopPropagation()}
				onKeyDown={(event) => event.stopPropagation()}
			>
				<span className="min-w-0 whitespace-normal break-words text-left">{label}</span>
			</button>
		</ContextHelp>
	)
}

export function ProjectFileTag({ item }: { item: AttachmentItem }) {
	const kind = isMagicSystemFolder(item)
		? "magic"
		: resolveProjectInstructionsFileKind(item)
			? "instructions"
			: undefined
	const presentation = useSystemFileHelp(kind)
	return presentation ? <TopicFileTag {...presentation} /> : null
}
