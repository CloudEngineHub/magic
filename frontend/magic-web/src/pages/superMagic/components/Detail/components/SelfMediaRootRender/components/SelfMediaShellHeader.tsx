import { memo, type ReactNode } from "react"
import { ChevronLeft, Crosshair, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import ExportPanel from "./ExportPanel"
import PlatformBrandIcon from "./PlatformBrandIcon"
import ViewTabs from "./ViewTabs"
import type { SelfMediaPlatform } from "../../../types"
import type { SelfMediaPost, SelfMediaView } from "../types"

interface SelfMediaShellHeaderProps {
	platform: SelfMediaPlatform
	posts: SelfMediaPost[]
	activePostIndex: number
	view: SelfMediaView
	tabLabels: Partial<Record<SelfMediaView, string>>
	visibleTabs: SelfMediaView[]
	onChangeView: (view: SelfMediaView) => void
	onRefresh: () => void
	onBackHome?: () => void
	refreshLabel: string
	refreshDisabled?: boolean
	refreshTestId: string
	exportAction?: ReactNode
	exportLabel?: string
	exportDisabled?: boolean
	onOpenExport?: () => void
	onStartInspector?: () => void
	onStopInspector?: () => void
	inspectorActive?: boolean
	inspectorDisabled?: boolean
}

function SelfMediaShellHeader({
	platform,
	posts,
	activePostIndex,
	view,
	tabLabels,
	visibleTabs,
	onChangeView,
	onRefresh,
	onBackHome,
	refreshLabel,
	refreshDisabled,
	refreshTestId,
	exportAction,
	exportLabel,
	exportDisabled,
	onOpenExport,
	onStartInspector,
	onStopInspector,
	inspectorActive,
	inspectorDisabled,
}: SelfMediaShellHeaderProps) {
	const { t } = useTranslation("super")
	const activePost = posts[activePostIndex]
	const articleTitle =
		activePost?.meta.feedTitle ||
		activePost?.meta.title ||
		t("detail.selfMedia.common.postFallbackTitle", { index: activePostIndex + 1 })

	return (
		<header
			className="grid grid-cols-[minmax(14rem,1fr)_auto] items-center gap-3 border-b border-zinc-950/10 bg-white px-4 py-3 max-lg:grid-cols-1 max-lg:items-stretch"
			data-testid="self-media-shell-header"
		>
			<div className="flex min-w-0 items-center gap-3" data-testid="self-media-shell-title">
				{onBackHome ? (
					<button
						type="button"
						className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 bg-zinc-100 px-4 py-2.5 text-xs font-black text-zinc-950 transition-all hover:bg-zinc-200 active:scale-[0.98]"
						onClick={onBackHome}
						data-testid="self-media-shell-back-home-button"
					>
						<ChevronLeft size={14} />
						<span>{t("detail.selfMedia.home.backHome")}</span>
					</button>
				) : null}
				<PlatformBrandIcon platform={platform} className="size-5" />
				<div className="min-w-0 border-l-2 border-zinc-950 pl-3">
					<p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
						{t("detail.selfMedia.home.article")}
					</p>
					<h2
						className="truncate text-sm font-black text-zinc-950"
						data-testid="self-media-shell-platform-title"
					>
						{articleTitle}
					</h2>
				</div>
			</div>
			<div className="flex min-w-0 shrink-0 items-center justify-end gap-3 max-lg:justify-between">
				<ViewTabs
					value={view}
					onChange={onChangeView}
					labels={tabLabels}
					order={visibleTabs}
				/>
				<div className="flex shrink-0 items-center gap-2 border-l border-dashed border-zinc-950/10 pl-3">
					{onStartInspector && !inspectorDisabled ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={inspectorActive ? onStopInspector : onStartInspector}
									data-testid="self-media-shell-inspector-button"
									aria-label={t("detail.selfMedia.common.inspectElement")}
									className={cn(
										"inline-flex cursor-pointer items-center justify-center p-2.5 transition-all active:scale-[0.98]",
										inspectorActive
											? "bg-zinc-950 text-white"
											: "bg-zinc-100 text-zinc-950 hover:bg-zinc-200",
									)}
								>
									<Crosshair className="h-3.5 w-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent>
								{t("detail.selfMedia.common.inspectElement")}
							</TooltipContent>
						</Tooltip>
					) : null}
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								disabled={refreshDisabled}
								onClick={onRefresh}
								data-testid={refreshTestId}
								aria-label={refreshLabel}
								className="inline-flex cursor-pointer items-center justify-center bg-zinc-100 p-2.5 text-zinc-950 transition-all hover:bg-zinc-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
							>
								<RefreshCw className="h-3.5 w-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent>{refreshLabel}</TooltipContent>
					</Tooltip>
					{exportAction ??
						(onOpenExport ? (
							<ExportPanel
								onOpen={onOpenExport}
								label={exportLabel}
								disabled={exportDisabled}
							/>
						) : null)}
				</div>
			</div>
		</header>
	)
}

export default memo(SelfMediaShellHeader)
