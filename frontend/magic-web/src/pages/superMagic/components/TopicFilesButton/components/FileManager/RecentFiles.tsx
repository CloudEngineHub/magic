import { Clock3 } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import SmartTooltip from "@/components/other/SmartTooltip"
import { FileResourceIcon } from "../FileResourceIcon"
import {
	resolveFilePresentation,
	type getFilePresentationIndex,
} from "../../utils/file-presentation"
import type { AttachmentItem } from "../../hooks/types"
import type { FileHelpContext } from "../../utils/magic-system-folder"

export function RecentFiles({
	attachments,
	presentationIndex,
	context,
	onOpen,
	getPopupContainer,
}: {
	attachments: AttachmentItem[]
	presentationIndex: ReturnType<typeof getFilePresentationIndex>
	context: FileHelpContext
	onOpen: (file: AttachmentItem) => void
	getPopupContainer: () => HTMLElement | null
}) {
	const { t } = useTranslation("super")
	const recentFiles = useMemo(
		() =>
			attachments
				.filter((file) => !file.is_directory && !file.is_hidden && file.file_id)
				.sort((left, right) =>
					String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? "")),
				)
				.slice(0, 5),
		[attachments],
	)

	return (
		<div className="mb-3 border-b border-border/60 pb-3">
			<div className="flex items-center gap-2 px-2 pb-1.5 text-[11px] font-medium text-muted-foreground">
				<Clock3 size={13} />
				{t("fileManager.recent")}
			</div>
			{recentFiles.length === 0 ? (
				<p className="px-2 text-[11px] text-muted-foreground">
					{t("fileManager.recentEmpty")}
				</p>
			) : (
				recentFiles.map((file) => {
					const presentation = resolveFilePresentation(file, {
						context,
						index: presentationIndex,
					})
					return (
						<button
							key={file.file_id}
							type="button"
							className="flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-left text-xs hover:bg-accent/50"
							onClick={() => onOpen(file)}
						>
							<FileResourceIcon presentation={presentation} size={14} />
							<SmartTooltip
								fileName
								elementType="span"
								className="min-w-0 flex-1 truncate"
								placement="bottom"
								sideOffset={4}
								getPopupContainer={getPopupContainer}
							>
								{presentation.name}
							</SmartTooltip>
						</button>
					)
				})
			)}
		</div>
	)
}
