import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

interface SlidesTemplateCanvasStatusProps {
	isInitialLoading: boolean
	isLoading: boolean
	isLoadingMore: boolean
	isRefreshing: boolean
	templateCount: number
}

export default function SlidesTemplateCanvasStatus({
	isInitialLoading,
	isLoading,
	isLoadingMore,
	isRefreshing,
	templateCount,
}: SlidesTemplateCanvasStatusProps) {
	const { t } = useTranslation("crew/create")

	return (
		<>
			<div
				className={cn(
					"pointer-events-none absolute right-5 top-5 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-white/75 shadow-lg backdrop-blur-md",
					!isInitialLoading && !isRefreshing && !isLoadingMore && "opacity-0",
				)}
				data-testid="slides-template-canvas-status"
			>
				{isInitialLoading
					? t("playbook.edit.presets.form.loading")
					: isLoadingMore
						? t("playbook.edit.presets.form.loadingMore")
						: t("playbook.edit.presets.form.refreshing")}
			</div>
			{!isLoading && templateCount === 0 ? (
				<div
					className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-black/50 px-5 py-4 text-sm text-white/75 shadow-xl backdrop-blur-md"
					data-testid="slides-template-canvas-empty"
				>
					{t("playbook.edit.presets.form.emptySlidesTemplates")}
				</div>
			) : null}
		</>
	)
}
