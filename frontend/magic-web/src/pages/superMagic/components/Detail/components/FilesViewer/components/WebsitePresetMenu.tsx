import { Plus } from "lucide-react"
import { memo, useMemo, useState } from "react"
import { Tooltip } from "antd"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import { buildCustomWebsitePreset, WEBSITE_PRESETS } from "../utils/websiteTabs"
import type { WebsitePreset } from "../types"
import { useTranslation } from "react-i18next"

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

function WebsitePresetIcon({ icon }: { icon?: WebsitePreset["icon"] }) {
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

	return null
}

const WebsitePresetMenu = memo(function WebsitePresetMenu({
	onOpenWebsiteTab,
}: WebsitePresetMenuProps) {
	const { t } = useTranslation("super")
	const [customUrl, setCustomUrl] = useState("")
	const customPreset = useMemo(
		() => buildCustomWebsitePreset(customUrl, t("fileViewer.website.customDescription")),
		[customUrl, t],
	)

	const handleOpenCustomWebsite = () => {
		if (!customPreset) return
		onOpenWebsiteTab(customPreset)
		setCustomUrl("")
	}

	return (
		<DropdownMenu>
			<Tooltip title={t("fileViewer.website.add")} placement="bottom" mouseEnterDelay={0.3}>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="relative mx-1 flex size-7 shrink-0 cursor-pointer select-none items-center justify-center rounded-md text-foreground transition-all duration-200 hover:bg-black/10"
						aria-label={t("fileViewer.website.add")}
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
					>
						<input
							value={customUrl}
							onChange={(event) => setCustomUrl(event.target.value)}
							onKeyDown={(event) => event.stopPropagation()}
							placeholder={t("fileViewer.website.customPlaceholder")}
							className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
						/>
						<button
							type="submit"
							disabled={!customPreset}
							className="h-8 shrink-0 rounded-md px-2 text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
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
							<WebsitePresetIcon icon={preset.icon} />
							<span className="min-w-0 flex-1 truncate text-sm leading-5 text-foreground">
								{getTranslatedPreset(preset, t).title}
							</span>
						</DropdownMenuItem>
					))}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	)
})

export default WebsitePresetMenu
