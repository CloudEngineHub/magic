import { memo } from "react"
import { Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"

interface ExportPanelProps {
	/** Open the export preview dialog. */
	onOpen: () => void
	className?: string
	label?: string
	disabled?: boolean
}

function ExportPanel({ onOpen, className, label = "Export ZIP", disabled }: ExportPanelProps) {
	const { t } = useTranslation("super")
	const displayLabel = label === "Export ZIP" ? t("detail.selfMedia.export.action") : label
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<button
				type="button"
				onClick={onOpen}
				disabled={disabled}
				data-testid="self-media-export-btn"
				className="inline-flex cursor-pointer items-center justify-center gap-2 bg-zinc-950 px-4 py-2.5 text-xs font-black text-white transition-all hover:bg-zinc-900 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
			>
				<Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
				{displayLabel}
			</button>
		</div>
	)
}

export default memo(ExportPanel)
