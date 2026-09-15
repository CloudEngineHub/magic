import { useMemo, useState } from "react"
import { Paperclip, Folder, FileText } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/shadcn-ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { MagicTooltip } from "@/components/base"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { getAttachmentName } from "@/pages/superMagic/utils/projectAttachments/treeUtils"

interface PublishedMicroAppAttachmentPopoverProps {
	attachments: AttachmentItem[]
}

interface AttachmentRow {
	item: AttachmentItem
	level: number
}

function flattenAttachments(items: AttachmentItem[], level = 0): AttachmentRow[] {
	// Use an explicit stack so a deeply nested project tree cannot overflow the call stack.
	const rows: AttachmentRow[] = []
	const stack = items.map((item) => ({ item, level })).reverse()

	while (stack.length) {
		const row = stack.pop()
		if (!row || row.item.is_hidden) continue
		rows.push(row)
		if (row.item.is_directory && row.item.children?.length) {
			for (let index = row.item.children.length - 1; index >= 0; index -= 1) {
				stack.push({ item: row.item.children[index], level: row.level + 1 })
			}
		}
	}

	return rows
}

export default function PublishedMicroAppAttachmentPopover({
	attachments,
}: PublishedMicroAppAttachmentPopoverProps) {
	const { t } = useTranslation("super")
	const [open, setOpen] = useState(false)
	// Attachment trees can be large; defer flattening until the user opens the popover.
	const rows = useMemo(() => (open ? flattenAttachments(attachments) : []), [attachments, open])

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<MagicTooltip title={t("attachmentList.projectFiles")}>
				<span>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							className="!size-6 !min-h-6 !min-w-6 !rounded-md !p-0 text-muted-foreground hover:text-foreground"
							aria-label={t("attachmentList.projectFiles")}
							data-testid="published-micro-app-attachments-button"
						>
							<Paperclip size={16} aria-hidden />
						</Button>
					</PopoverTrigger>
				</span>
			</MagicTooltip>
			<PopoverContent
				align="end"
				className="w-80 overflow-hidden p-0"
				data-testid="published-micro-app-attachments-popover"
			>
				<div className="border-b border-border px-3 py-2 text-sm font-medium text-foreground">
					{t("attachmentList.projectFiles")}
				</div>
				<div className="max-h-72 overflow-y-auto p-1">
					{rows.length ? (
						rows.map(({ item, level }, index) => {
							const name = getAttachmentName(item)
							return (
								<div
									key={item.file_id || `${name}-${index}`}
									className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground"
									style={{ paddingLeft: `${8 + level * 16}px` }}
									data-testid="published-micro-app-attachment-row"
								>
									{item.is_directory ? (
										<Folder
											className="size-4 shrink-0 text-muted-foreground"
											aria-hidden
										/>
									) : (
										<FileText
											className="size-4 shrink-0 text-muted-foreground"
											aria-hidden
										/>
									)}
									<span className="min-w-0 truncate" title={name}>
										{name}
									</span>
								</div>
							)
						})
					) : (
						<div className="px-2 py-6 text-center text-sm text-muted-foreground">
							{t("attachmentList.empty")}
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	)
}
