import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/shadcn-ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import type { AttachmentItem } from "../hooks/types"
import {
	isMagicSystemFolder,
	resolveProjectInstructionsFileKind,
} from "../utils/magic-system-folder"

/** 标签只解释用途；点击、键盘和触屏操作不能冒泡为文件打开或目录折叠。 */
export function TopicFileTag({ label, description }: { label: string; description: string }) {
	const [open, setOpen] = useState(false)
	return (
		<Tooltip open={open} onOpenChange={setOpen}>
			<TooltipTrigger asChild>
				<Badge
					asChild
					variant="outline"
					className="min-h-5 max-w-full rounded-md border-border bg-background px-2 py-0.5 text-[10px] font-normal leading-3 text-muted-foreground shadow-none"
				>
					<button
						type="button"
						aria-label={label}
						onPointerDown={(event) => event.stopPropagation()}
						onDoubleClick={(event) => event.stopPropagation()}
						onKeyDown={(event) => {
							event.stopPropagation()
							if (event.key === "Escape") setOpen(false)
						}}
						onClick={(event) => {
							// 保留点击打开，阻止 TooltipTrigger 默认的点击关闭；触屏也能读说明。
							event.preventDefault()
							event.stopPropagation()
							setOpen(true)
						}}
					>
						<span className="min-w-0 whitespace-normal break-words text-left">
							{label}
						</span>
					</button>
				</Badge>
			</TooltipTrigger>
			<TooltipContent side="right" sideOffset={4} className="max-w-64 text-left">
				{description}
			</TooltipContent>
		</Tooltip>
	)
}

export function ProjectFileTag({ item }: { item: AttachmentItem }) {
	const { t } = useTranslation("super")
	if (isMagicSystemFolder(item))
		return (
			<TopicFileTag
				label={t("userSpace.fileLabels.magic")}
				description={t("userSpace.fileHelp.magic")}
			/>
		)
	if (resolveProjectInstructionsFileKind(item))
		return (
			<TopicFileTag
				label={t("userSpace.fileLabels.instructions")}
				description={t("userSpace.fileHelp.instructions")}
			/>
		)
	return null
}
