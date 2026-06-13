import { memo, type FormEvent, type ReactNode, useEffect, useState } from "react"
import {
	Check,
	ChevronLeft,
	ClipboardCheck,
	Crosshair,
	Loader2,
	Pencil,
	RefreshCw,
	X,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
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
	onSaveTitle?: (title: string) => Promise<boolean | void> | boolean | void
}

interface SelfMediaShellViewBarProps {
	view: SelfMediaView
	tabLabels: Partial<Record<SelfMediaView, string>>
	visibleTabs: SelfMediaView[]
	onChangeView: (view: SelfMediaView) => void
	onRequestPrePublishAnalysis?: () => void
}

function SelfMediaShellHeader({
	platform,
	posts,
	activePostIndex,
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
	onSaveTitle,
}: SelfMediaShellHeaderProps) {
	const { t } = useTranslation("super")
	const activePost = posts[activePostIndex]
	const articleTitle =
		activePost?.meta.title ||
		activePost?.meta.feedTitle ||
		t("detail.selfMedia.common.postFallbackTitle", { index: activePostIndex + 1 })
	const [editingTitle, setEditingTitle] = useState(false)
	const [draftTitle, setDraftTitle] = useState(articleTitle)
	const [savingTitle, setSavingTitle] = useState(false)
	const [titleError, setTitleError] = useState<string | null>(null)

	useEffect(() => {
		if (editingTitle) return
		setDraftTitle(articleTitle)
	}, [articleTitle, editingTitle])

	const handleStartEditTitle = () => {
		if (!onSaveTitle) return
		setDraftTitle(articleTitle)
		setTitleError(null)
		setEditingTitle(true)
	}

	const handleCancelEditTitle = () => {
		setDraftTitle(articleTitle)
		setTitleError(null)
		setEditingTitle(false)
	}

	const handleSubmitTitle = async (event?: FormEvent<HTMLFormElement>) => {
		event?.preventDefault()
		if (!onSaveTitle || savingTitle) return
		const nextTitle = draftTitle.trim()
		if (!nextTitle) {
			setTitleError(t("detail.selfMedia.titleEdit.empty", "标题不能为空"))
			return
		}
		if (nextTitle === articleTitle) {
			setEditingTitle(false)
			setTitleError(null)
			return
		}
		setSavingTitle(true)
		setTitleError(null)
		try {
			const saved = await onSaveTitle(nextTitle)
			if (saved === false) {
				setTitleError(t("detail.selfMedia.titleEdit.failed", "标题保存失败，请稍后重试"))
				return
			}
			setEditingTitle(false)
		} catch {
			setTitleError(t("detail.selfMedia.titleEdit.failed", "标题保存失败，请稍后重试"))
		} finally {
			setSavingTitle(false)
		}
	}

	return (
		<header
			className="grid min-h-[72px] grid-cols-[minmax(14rem,1fr)_auto] items-center gap-3 bg-transparent px-3 py-2 max-lg:grid-cols-1 max-lg:items-stretch sm:min-h-[88px] sm:px-4 sm:py-3 lg:gap-4 lg:px-6"
			data-testid="self-media-shell-header"
		>
			<div className="flex min-w-0 items-center gap-3" data-testid="self-media-shell-title">
				{onBackHome ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-10 shrink-0 rounded-[14px] border-[#e4e4e7] bg-white px-3 text-sm font-[700] text-[#18181b] shadow-[0_3px_12px_rgba(24,24,27,0.06)] hover:bg-white hover:text-[#18181b] max-[380px]:w-10 max-[380px]:px-0 sm:h-11 sm:px-4"
						onClick={onBackHome}
						data-testid="self-media-shell-back-home-button"
					>
						<ChevronLeft size={17} />
						<span className="max-[380px]:sr-only">
							{t("detail.selfMedia.home.backHome")}
						</span>
					</Button>
				) : null}
				<span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-white text-[#18181b] shadow-[0_3px_12px_rgba(24,24,27,0.06)] sm:size-11">
					<PlatformBrandIcon
						platform={platform}
						className="size-5"
						testId="self-media-shell-platform-icon"
					/>
				</span>
				<div className="min-w-0 flex-1">
					<p className="text-xs font-[700] leading-[1.2] text-[#71717a]">
						{t("detail.selfMedia.home.article")}
					</p>
					{editingTitle ? (
						<form
							className="mt-1 flex min-w-0 items-center gap-2"
							onSubmit={handleSubmitTitle}
						>
							<div className="min-w-0 flex-1">
								<Input
									value={draftTitle}
									onChange={(event) => setDraftTitle(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Escape") handleCancelEditTitle()
									}}
									disabled={savingTitle}
									autoFocus
									className="h-9 rounded-[12px] border-[#d4d4d8] bg-white px-3 text-base font-[800] text-[#18181b] shadow-none focus-visible:ring-[#18181b]/15"
									data-testid="self-media-shell-title-input"
									aria-label={t("detail.selfMedia.titleEdit.input", "文章标题")}
								/>
								{titleError ? (
									<p className="mt-1 text-xs font-[600] text-[#dc2626]">
										{titleError}
									</p>
								) : null}
							</div>
							<Button
								type="submit"
								variant="ghost"
								size="icon"
								disabled={savingTitle}
								className="size-9 shrink-0 rounded-[12px] text-[#18181b] hover:bg-[#f1f1f2] hover:text-[#18181b]"
								data-testid="self-media-shell-save-title-button"
								aria-label={t("detail.selfMedia.titleEdit.save", "保存标题")}
							>
								{savingTitle ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Check className="h-4 w-4" />
								)}
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								disabled={savingTitle}
								onClick={handleCancelEditTitle}
								className="size-9 shrink-0 rounded-[12px] text-[#71717a] hover:bg-[#f1f1f2] hover:text-[#18181b]"
								data-testid="self-media-shell-cancel-title-button"
								aria-label={t("detail.selfMedia.titleEdit.cancel", "取消编辑")}
							>
								<X className="h-4 w-4" />
							</Button>
						</form>
					) : (
						<div className="mt-0.5 flex min-w-0 items-start gap-1.5">
							<h2
								className="min-w-0 whitespace-normal break-words text-sm font-[800] leading-[1.3] text-[#18181b] sm:text-base sm:leading-[1.25]"
								data-testid="self-media-shell-platform-title"
							>
								{articleTitle}
							</h2>
							{onSaveTitle ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={handleStartEditTitle}
											className="mt-[-4px] size-8 shrink-0 rounded-[12px] text-[#71717a] hover:bg-[#f1f1f2] hover:text-[#18181b]"
											data-testid="self-media-shell-edit-title-button"
											aria-label={t(
												"detail.selfMedia.titleEdit.edit",
												"编辑标题",
											)}
										>
											<Pencil className="h-3.5 w-3.5" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{t("detail.selfMedia.titleEdit.edit", "编辑标题")}
									</TooltipContent>
								</Tooltip>
							) : null}
						</div>
					)}
				</div>
			</div>
			<div className="flex min-w-0 items-center justify-end gap-3 max-lg:justify-start max-md:flex-col max-md:items-stretch lg:gap-4">
				<div
					className="flex max-w-full shrink-0 items-center justify-end gap-2 overflow-x-auto rounded-[18px] max-lg:justify-start"
					data-testid="self-media-shell-toolbar"
				>
					<div className="flex h-11 shrink-0 items-center gap-1.5 rounded-[16px] bg-white/80 px-1.5 shadow-[inset_0_1px_rgba(255,255,255,0.82),0_3px_14px_rgba(24,24,27,0.05)] sm:h-12 sm:gap-2 sm:rounded-[18px] sm:px-2">
						{onStartInspector && !inspectorDisabled ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										onClick={
											inspectorActive ? onStopInspector : onStartInspector
										}
										data-testid="self-media-shell-inspector-button"
										aria-label={t("detail.selfMedia.common.inspectElement")}
										variant="ghost"
										size="icon"
										className={cn(
											"size-10 rounded-[14px] text-[#18181b] hover:bg-[#f1f1f2] hover:text-[#18181b]",
											inspectorActive &&
												"bg-[#18181b] text-white hover:bg-[#18181b] hover:text-white",
										)}
									>
										<Crosshair className="h-4 w-4" />
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
									variant="ghost"
									size="icon"
									className="size-10 rounded-[14px] text-[#18181b] hover:bg-[#f1f1f2] hover:text-[#18181b]"
								>
									<RefreshCw className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>{refreshLabel}</TooltipContent>
						</Tooltip>
					</div>
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

export function SelfMediaShellViewBar({
	view,
	tabLabels,
	visibleTabs,
	onChangeView,
	onRequestPrePublishAnalysis,
}: SelfMediaShellViewBarProps) {
	const { t } = useTranslation("super")

	return (
		<footer
			className="shrink-0 border-t border-[#f1f1f2] bg-white px-2 py-2 sm:px-4 sm:py-3"
			data-testid="self-media-shell-view-bar"
		>
			<div className="mx-auto grid max-w-full grid-cols-[1fr_auto_1fr] items-center gap-3 max-md:grid-cols-1">
				<div aria-hidden="true" className="min-w-0 max-md:hidden" />
				<div className="flex min-w-0 justify-start overflow-x-auto sm:justify-center">
					<ViewTabs
						value={view}
						onChange={onChangeView}
						labels={tabLabels}
						order={visibleTabs}
					/>
				</div>
				{onRequestPrePublishAnalysis ? (
					<div className="flex justify-end max-md:justify-center">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onRequestPrePublishAnalysis}
							className="h-10 shrink-0 rounded-[14px] border-[#e4e4e7] bg-white px-3 text-xs font-[800] text-[#18181b] shadow-[0_3px_12px_rgba(24,24,27,0.06)] hover:bg-[#18181b] hover:text-white"
							data-testid="self-media-footer-pre-publish-analysis"
						>
							<ClipboardCheck className="h-4 w-4" />
							<span>{t("detail.selfMedia.analysis.action")}</span>
						</Button>
					</div>
				) : (
					<div aria-hidden="true" className="min-w-0 max-md:hidden" />
				)}
			</div>
		</footer>
	)
}

export default memo(SelfMediaShellHeader)
