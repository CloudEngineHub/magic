import { ClipboardCheck } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

interface PrePublishAnalysisFloatingButtonProps {
	onClick: () => void
	className?: string
}

export function PrePublishAnalysisFloatingButton({
	onClick,
	className,
}: PrePublishAnalysisFloatingButtonProps) {
	const { t } = useTranslation("super")

	return (
		<button
			type="button"
			onClick={onClick}
			data-testid="self-media-floating-pre-publish-analysis"
			className={cn(
				"absolute bottom-6 right-6 z-30 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]",
				className,
			)}
		>
			<ClipboardCheck className="h-4 w-4" />
			<span>{t("detail.selfMedia.analysis.action")}</span>
		</button>
	)
}

export default PrePublishAnalysisFloatingButton
