import { Loader2, Plus, X } from "lucide-react"
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { MouseEvent, UIEvent } from "react"
import { Tooltip } from "antd"
import { SuperMagicApi } from "@/apis"
import type { MicroAppListItem } from "@/apis/modules/superMagic"
import magicToast from "@/components/base/MagicToaster/utils"
import MicroAppIcon from "@/components/business/MentionPanel/components/icons/MicroAppIcon"
import { isMicroAppEnabled } from "@/services/microAppFeature"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/shadcn-ui/context-menu"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import {
	buildCustomWebsitePreset,
	COMMON_WEBSITE_PRESETS_CHANGE_EVENT,
	getCommonWebsitePresets,
	getWebsitePresets,
	removeCommonWebsitePreset,
	updateCommonWebsitePreset,
} from "../utils/websiteTabs"
import type { WebsitePreset } from "../types"
import { useTranslation } from "react-i18next"
import CommonWebsitePresetDialog, {
	type CommonWebsitePresetFormValues,
} from "./CommonWebsitePresetDialog"

interface WebsitePresetMenuProps {
	onOpenWebsiteTab: (preset: WebsitePreset) => void
	onOpenMicroAppTab?: (data: { appId: string; appName?: string }) => void
}

function getTranslatedPreset(preset: WebsitePreset, t: (key: string) => string): WebsitePreset {
	return {
		...preset,
		title: preset.titleKey ? t(preset.titleKey) : preset.title || preset.id,
		description: preset.descriptionKey ? t(preset.descriptionKey) : preset.description || "",
	}
}

function WebsitePresetIcon({ iconSrc, presetId }: { iconSrc?: string; presetId: string }) {
	if (iconSrc) {
		return (
			<img
				data-testid={`website-preset-icon-${presetId}`}
				className="size-5 shrink-0 rounded-md object-cover"
				src={iconSrc}
				alt=""
				aria-hidden="true"
			/>
		)
	}

	return null
}

const WebsitePresetMenu = memo(function WebsitePresetMenu({
	onOpenWebsiteTab,
	onOpenMicroAppTab,
}: WebsitePresetMenuProps) {
	const { t } = useTranslation("super")
	const [open, setOpen] = useState(false)
	const [customUrl, setCustomUrl] = useState("")
	const [commonWebsitePresets, setCommonWebsitePresets] = useState(() =>
		getCommonWebsitePresets(),
	)
	const [editingPreset, setEditingPreset] = useState<WebsitePreset | null>(null)
	const [microApps, setMicroApps] = useState<MicroAppListItem[]>([])
	const [microAppsQuery, setMicroAppsQuery] = useState("")
	const [microAppsLoading, setMicroAppsLoading] = useState(false)
	const [microAppsLoadingMore, setMicroAppsLoadingMore] = useState(false)
	const [microAppsHasMore, setMicroAppsHasMore] = useState(false)
	const [websiteHeaderHeight, setWebsiteHeaderHeight] = useState(76)
	const websiteHeaderRef = useRef<HTMLDivElement>(null)
	const microAppsPageRef = useRef(0)
	const microAppsRequestRef = useRef(0)
	const customPreset = useMemo(
		() => buildCustomWebsitePreset(customUrl, t("fileViewer.website.customDescription")),
		[customUrl, t],
	)

	useEffect(() => {
		const syncCommonWebsitePresets = () => {
			setCommonWebsitePresets(getCommonWebsitePresets())
		}

		window.addEventListener("storage", syncCommonWebsitePresets)
		window.addEventListener(COMMON_WEBSITE_PRESETS_CHANGE_EVENT, syncCommonWebsitePresets)
		return () => {
			window.removeEventListener("storage", syncCommonWebsitePresets)
			window.removeEventListener(
				COMMON_WEBSITE_PRESETS_CHANGE_EVENT,
				syncCommonWebsitePresets,
			)
		}
	}, [])

	// Search requests can finish out of order; the request id prevents an older page from
	// replacing results for a newer keyword while preserving the current scroll position.
	const loadMicroApps = useCallback(async (page: number, keyword: string, append: boolean) => {
		if (!isMicroAppEnabled() || typeof SuperMagicApi?.getMentionMicroApps !== "function") {
			return
		}

		const requestId = ++microAppsRequestRef.current
		if (append) setMicroAppsLoadingMore(true)
		else setMicroAppsLoading(true)

		try {
			const response = await SuperMagicApi.getMentionMicroApps({
				page,
				page_size: 20,
				keyword,
			})
			if (requestId !== microAppsRequestRef.current) return

			const nextItems = (Array.isArray(response?.list) ? response.list : []).filter(
				(item) => item.publish_status === "published",
			)
			setMicroApps((current) => (append ? [...current, ...nextItems] : nextItems))
			microAppsPageRef.current = page
			setMicroAppsHasMore(page * (response?.page_size || 20) < (response?.total || 0))
		} catch {
			if (!append && requestId === microAppsRequestRef.current) {
				setMicroApps([])
				setMicroAppsHasMore(false)
			}
		} finally {
			if (requestId === microAppsRequestRef.current) {
				setMicroAppsLoading(false)
				setMicroAppsLoadingMore(false)
			}
		}
	}, [])

	useEffect(() => {
		if (!open || !isMicroAppEnabled()) return
		const timer = window.setTimeout(() => {
			microAppsPageRef.current = 0
			void loadMicroApps(1, microAppsQuery.trim(), false)
		}, 200)
		return () => window.clearTimeout(timer)
	}, [loadMicroApps, microAppsQuery, open])

	// The second sticky section starts below the first one so both filters remain visible
	// instead of occupying the same top position when the list reaches that section.
	useLayoutEffect(() => {
		const header = websiteHeaderRef.current
		if (!header) return

		const updateHeaderHeight = () => {
			const nextHeight = header.getBoundingClientRect().height
			if (nextHeight > 0) setWebsiteHeaderHeight(nextHeight)
		}
		updateHeaderHeight()
		if (typeof ResizeObserver === "undefined") return
		const observer = new ResizeObserver(updateHeaderHeight)
		observer.observe(header)
		return () => observer.disconnect()
	}, [])

	const handleMicroAppsScroll = useCallback(
		(event: UIEvent<HTMLDivElement>) => {
			const target = event.currentTarget
			if (
				!microAppsHasMore ||
				microAppsLoading ||
				microAppsLoadingMore ||
				target.scrollHeight - target.scrollTop - target.clientHeight > 48
			) {
				return
			}
			void loadMicroApps(microAppsPageRef.current + 1, microAppsQuery.trim(), true)
		},
		[microAppsHasMore, microAppsLoading, microAppsLoadingMore, microAppsQuery, loadMicroApps],
	)

	const handleOpenCustomWebsite = () => {
		if (!customPreset) return
		onOpenWebsiteTab(customPreset)
		setCustomUrl("")
	}

	const handleDeleteCommonWebsite = (presetId: string) => {
		removeCommonWebsitePreset(presetId)
		setCommonWebsitePresets(getCommonWebsitePresets())
	}

	const handleCloseCommonWebsite = (event: MouseEvent<HTMLButtonElement>, presetId: string) => {
		event.preventDefault()
		event.stopPropagation()
		handleDeleteCommonWebsite(presetId)
	}

	const handleSubmitEditCommonWebsite = (values: CommonWebsitePresetFormValues) => {
		if (!editingPreset) return
		const result = updateCommonWebsitePreset(editingPreset.id, values)
		if (result.status === "exists") {
			magicToast.warning(t("fileViewer.website.commonAlreadyExists"))
			return
		}
		if (result.status !== "saved") {
			magicToast.warning(t("fileViewer.website.commonSaveFailed"))
			return
		}

		setEditingPreset(null)
		setCommonWebsitePresets(getCommonWebsitePresets())
		magicToast.success(t("fileViewer.website.commonSaved"))
	}

	return (
		<DropdownMenu onOpenChange={setOpen}>
			<Tooltip title={t("fileViewer.website.add")} placement="bottom" mouseEnterDelay={0.3}>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="relative mx-1 flex size-7 shrink-0 cursor-pointer select-none items-center justify-center rounded-md text-foreground transition-all duration-200 hover:bg-black/10"
						aria-label={t("fileViewer.website.add")}
						data-testid="website-preset-menu-add-button"
					>
						<Plus className="size-4" aria-hidden="true" />
					</button>
				</DropdownMenuTrigger>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				className="flex max-h-[420px] w-[260px] flex-col overflow-hidden p-0"
			>
				<div
					data-testid="website-preset-list"
					className="min-h-0 flex-1 overflow-y-auto px-1 pb-1 pt-0"
					onScroll={handleMicroAppsScroll}
				>
					<div
						data-testid="website-preset-menu-header"
						className="sticky top-0 z-10 shrink-0 bg-popover p-1"
						ref={websiteHeaderRef}
					>
						<DropdownMenuLabel className="px-1.5 py-1.5 text-xs font-normal text-muted-foreground">
							{t("fileViewer.website.menuTitle")}
						</DropdownMenuLabel>
						<form
							className="flex gap-1 px-1.5 py-1"
							onSubmit={(event) => {
								event.preventDefault()
								handleOpenCustomWebsite()
							}}
							data-testid="handle-open-custom-website"
						>
							<input
								value={customUrl}
								onChange={(event) => setCustomUrl(event.target.value)}
								onKeyDown={(event) => event.stopPropagation()}
								placeholder={t("fileViewer.website.customPlaceholder")}
								className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
								data-testid="set-custom-url"
							/>
							<button
								type="submit"
								disabled={!customPreset}
								className="h-8 shrink-0 rounded-md px-2 text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
								data-testid="submit-button"
							>
								{t("fileViewer.website.openCustom")}
							</button>
						</form>
					</div>
					{getWebsitePresets().map((preset) => (
						<DropdownMenuItem
							key={preset.id}
							aria-label={getTranslatedPreset(preset, t).title}
							className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2"
							onClick={() => onOpenWebsiteTab(getTranslatedPreset(preset, t))}
						>
							<WebsitePresetIcon iconSrc={preset.iconSrc} presetId={preset.id} />
							<span className="min-w-0 flex-1 truncate text-sm leading-5 text-foreground">
								{getTranslatedPreset(preset, t).title}
							</span>
						</DropdownMenuItem>
					))}
					{isMicroAppEnabled() && (
						<>
							<DropdownMenuSeparator />
							{/* Keep the filter available while the long micro-app result list scrolls. */}
							<div
								className="sticky z-20 -mx-1 bg-popover px-1 pb-1"
								style={{ top: websiteHeaderHeight }}
								data-testid="micro-app-filter-header"
							>
								<DropdownMenuLabel className="px-1.5 py-1.5 text-xs font-normal text-muted-foreground">
									{t("fileViewer.website.microApps.title")}
								</DropdownMenuLabel>
								<div className="px-1.5">
									<input
										value={microAppsQuery}
										onChange={(event) => setMicroAppsQuery(event.target.value)}
										onKeyDown={(event) => event.stopPropagation()}
										placeholder={t(
											"fileViewer.website.microApps.searchPlaceholder",
										)}
										className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
										data-testid="micro-app-search-input"
									/>
								</div>
							</div>
							{microAppsLoading ? (
								<div className="flex items-center justify-center gap-2 px-2 py-4 text-xs text-muted-foreground">
									<Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
									{t("fileViewer.website.microApps.loading")}
								</div>
							) : microApps.length > 0 ? (
								microApps.map((microApp) => (
									<DropdownMenuItem
										key={microApp.app_id}
										aria-label={microApp.app_name}
										className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2"
										onClick={() =>
											onOpenMicroAppTab?.({
												appId: microApp.app_id,
												appName: microApp.app_name,
											})
										}
									>
										{microApp.cover_url ? (
											<img
												src={microApp.cover_url}
												alt=""
												className="size-5 shrink-0 rounded-md object-cover"
											/>
										) : (
											<MicroAppIcon size={20} />
										)}
										<span className="min-w-0 flex-1 truncate text-sm leading-5 text-foreground">
											{microApp.app_name}
										</span>
									</DropdownMenuItem>
								))
							) : (
								<div className="px-2 py-4 text-center text-xs text-muted-foreground">
									{t("fileViewer.website.microApps.empty")}
								</div>
							)}
							{microAppsLoadingMore && (
								<div className="flex items-center justify-center gap-2 px-2 py-2 text-xs text-muted-foreground">
									<Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
									{t("fileViewer.website.microApps.loadingMore")}
								</div>
							)}
						</>
					)}
					{commonWebsitePresets.length > 0 && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal text-muted-foreground">
								{t("fileViewer.website.commonTitle")}
							</DropdownMenuLabel>
							{commonWebsitePresets.map((preset) => {
								const translatedPreset = getTranslatedPreset(preset, t)
								return (
									<ContextMenu key={preset.id}>
										<ContextMenuTrigger asChild>
											<div className="flex items-center rounded-md">
												<DropdownMenuItem
													aria-label={translatedPreset.title}
													className="min-w-0 flex-1 cursor-pointer gap-2 rounded-md px-2 py-2"
													onClick={() =>
														onOpenWebsiteTab(translatedPreset)
													}
												>
													<span
														className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold leading-none text-primary"
														aria-hidden="true"
													>
														{translatedPreset.title
															.slice(0, 1)
															.toUpperCase()}
													</span>
													<span className="min-w-0 flex-1 truncate text-sm leading-5 text-foreground">
														{translatedPreset.title}
													</span>
												</DropdownMenuItem>
												<Tooltip
													title={t("fileViewer.website.removeCommon")}
													placement="left"
												>
													<button
														type="button"
														className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
														aria-label={`${t("fileViewer.website.removeCommon")} ${translatedPreset.title}`}
														onPointerDown={(event) =>
															event.stopPropagation()
														}
														onClick={(event) =>
															handleCloseCommonWebsite(
																event,
																preset.id,
															)
														}
														data-testid="on-pointer-down"
													>
														<X
															className="size-3.5"
															aria-hidden="true"
														/>
													</button>
												</Tooltip>
											</div>
										</ContextMenuTrigger>
										<ContextMenuContent>
											<ContextMenuItem
												onSelect={() => setEditingPreset(preset)}
											>
												{t("fileViewer.website.editCommon")}
											</ContextMenuItem>
											<ContextMenuSeparator />
											<ContextMenuItem
												className="text-destructive focus:text-destructive"
												onSelect={() =>
													handleDeleteCommonWebsite(preset.id)
												}
											>
												{t("fileViewer.website.deleteCommon")}
											</ContextMenuItem>
										</ContextMenuContent>
									</ContextMenu>
								)
							})}
						</>
					)}
				</div>
			</DropdownMenuContent>
			<CommonWebsitePresetDialog
				open={Boolean(editingPreset)}
				mode="edit"
				initialValues={{
					title: editingPreset?.title || "",
					url: editingPreset?.url || "",
					description: editingPreset?.description || "",
				}}
				onOpenChange={(open) => {
					if (!open) setEditingPreset(null)
				}}
				onSubmit={handleSubmitEditCommonWebsite}
			/>
		</DropdownMenu>
	)
})

export default WebsitePresetMenu
