import { Plus, X } from "lucide-react"
import { memo, useEffect, useMemo, useState } from "react"
import type { MouseEvent } from "react"
import { Tooltip } from "antd"
import magicToast from "@/components/base/MagicToaster/utils"
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
	removeCommonWebsitePreset,
	updateCommonWebsitePreset,
	WEBSITE_PRESETS,
} from "../utils/websiteTabs"
import type { WebsitePreset } from "../types"
import { useTranslation } from "react-i18next"
import CommonWebsitePresetDialog, {
	type CommonWebsitePresetFormValues,
} from "./CommonWebsitePresetDialog"

interface WebsitePresetMenuProps {
	onOpenWebsiteTab: (preset: WebsitePreset) => void
}

function getTranslatedPreset(preset: WebsitePreset, t: (key: string) => string): WebsitePreset {
	return {
		...preset,
		title: preset.titleKey ? t(preset.titleKey) : preset.title || preset.id,
		description: preset.descriptionKey ? t(preset.descriptionKey) : preset.description || "",
	}
}

function WebsitePresetIcon({
	icon,
	iconSrc,
	presetId,
}: {
	icon?: WebsitePreset["icon"]
	iconSrc?: string
	presetId: string
}) {
	if (icon === "nano-banana-pro") {
		return (
			<span
				data-testid="website-preset-icon-nano-banana-pro"
				className="flex size-5 shrink-0 items-center justify-center rounded-md bg-[#ffdb0f] text-[10px] font-semibold leading-none text-[#3d3300]"
				aria-hidden="true"
			>
				N
			</span>
		)
	}

	if (icon === "gpt-image-2") {
		return (
			<span
				data-testid="website-preset-icon-gpt-image-2"
				className="flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold leading-none text-white"
				style={{
					backgroundImage:
						"linear-gradient(149.057deg, rgb(38, 31, 70) 33.301%, rgb(36, 26, 214) 66.065%, rgb(165, 23, 253) 100%)",
				}}
				aria-hidden="true"
			>
				G
			</span>
		)
	}

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
}: WebsitePresetMenuProps) {
	const { t } = useTranslation("super")
	const [customUrl, setCustomUrl] = useState("")
	const [commonWebsitePresets, setCommonWebsitePresets] = useState(() =>
		getCommonWebsitePresets(),
	)
	const [editingPreset, setEditingPreset] = useState<WebsitePreset | null>(null)
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
		<DropdownMenu>
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
					data-testid="website-preset-menu-header"
					className="sticky top-0 z-10 shrink-0 border-b border-border/70 bg-popover p-1"
				>
					<DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal text-muted-foreground">
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
				<div
					data-testid="website-preset-list"
					className="min-h-0 flex-1 overflow-y-auto p-1"
				>
					{WEBSITE_PRESETS.map((preset) => (
						<DropdownMenuItem
							key={preset.id}
							aria-label={getTranslatedPreset(preset, t).title}
							className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2"
							onClick={() => onOpenWebsiteTab(getTranslatedPreset(preset, t))}
						>
							<WebsitePresetIcon
								icon={preset.icon}
								iconSrc={preset.iconSrc}
								presetId={preset.id}
							/>
							<span className="min-w-0 flex-1 truncate text-sm leading-5 text-foreground">
								{getTranslatedPreset(preset, t).title}
							</span>
						</DropdownMenuItem>
					))}
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
