import { memo } from "react"
import { Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"

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
			<Button
				type="button"
				variant="default"
				size="sm"
				onClick={onOpen}
				disabled={disabled}
				data-testid="self-media-export-btn"
				className="gap-1.5 bg-zinc-950 px-4 text-xs font-black text-white shadow-none transition-all hover:bg-zinc-900 active:scale-[0.98]"
			>
				<Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
				{displayLabel}
			</Button>
		</div>
	)
}

export default memo(ExportPanel)
