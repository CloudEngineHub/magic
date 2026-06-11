import { memo, type ReactNode } from "react"
import { ChevronLeft, Crosshair, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/shadcn-ui/button"
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
			className="grid grid-cols-[minmax(14rem,1fr)_auto] items-center gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/90 max-lg:grid-cols-1 max-lg:items-stretch"
			data-testid="self-media-shell-header"
		>
			<div className="flex min-w-0 items-center gap-3" data-testid="self-media-shell-title">
				{onBackHome ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="shrink-0 text-xs"
						onClick={onBackHome}
						data-testid="self-media-shell-back-home-button"
					>
						<ChevronLeft size={14} />
						<span>{t("detail.selfMedia.home.backHome")}</span>
					</Button>
				) : null}
				<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
					<PlatformBrandIcon
						platform={platform}
						className="size-4"
						testId="self-media-shell-platform-icon"
					/>
				</span>
				<div className="min-w-0">
					<p className="text-[11px] font-medium text-muted-foreground">
						{t("detail.selfMedia.home.article")}
					</p>
					<h2
						className="truncate text-sm font-semibold text-foreground"
						data-testid="self-media-shell-platform-title"
					>
						{articleTitle}
					</h2>
				</div>
			</div>
			<div className="flex min-w-0 shrink-0 items-center justify-end gap-3 max-lg:justify-between max-sm:overflow-x-auto">
				<ViewTabs
					value={view}
					onChange={onChangeView}
					labels={tabLabels}
					order={visibleTabs}
				/>
				<div className="flex shrink-0 items-center gap-2 border-l pl-3">
					{onStartInspector && !inspectorDisabled ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									onClick={inspectorActive ? onStopInspector : onStartInspector}
									data-testid="self-media-shell-inspector-button"
									aria-label={t("detail.selfMedia.common.inspectElement")}
									variant={inspectorActive ? "default" : "outline"}
									size="icon-sm"
									className={cn(inspectorActive && "text-primary-foreground")}
								>
									<Crosshair className="h-3.5 w-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{t("detail.selfMedia.common.inspectElement")}
							</TooltipContent>
						</Tooltip>
					) : null}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								disabled={refreshDisabled}
								onClick={onRefresh}
								data-testid={refreshTestId}
								aria-label={refreshLabel}
								variant="outline"
								size="icon-sm"
							>
								<RefreshCw className="h-3.5 w-3.5" />
							</Button>
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
