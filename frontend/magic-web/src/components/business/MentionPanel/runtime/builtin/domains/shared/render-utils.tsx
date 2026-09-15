import { FileResourceIcon } from "@/pages/superMagic/components/TopicFilesButton/components/FileResourceIcon"
import { resolveFilePresentation } from "@/pages/superMagic/components/TopicFilesButton/utils/file-presentation"
import TSIcon, { IconParkIconElement } from "@/components/base/TSIcon"
import MagicAvatar from "@/components/base/MagicAvatar"
import { cn } from "@/utils/cn"
import { ICON_MAPPINGS } from "../../../../constants"
import type { DirectoryMentionData, MentionItem } from "../../../../types"
import type {
	MentionItemRendererContext,
	MentionItemRendererPlatform,
} from "../../../../renderers/types"
import { MentionPanelFileImageIcon } from "../file-preview/MentionPanelFileImageIcon"

export function getRendererIconSize(platform: MentionItemRendererPlatform) {
	return platform === "desktop" ? 16 : 20
}

export function getDesktopIconClassName(type: string): string {
	if (type === "mcp") {
		return "bg-gradient-to-r from-[#2e2f38] to-[#1c1d23] rounded-[3px] text-white"
	}
	if (type === "agent") {
		return "bg-gradient-to-br from-[#3f8fff] to-[#ef2fdf] rounded-[3px] text-white"
	}
	return ""
}

export function renderMentionAvatarIcon(params: {
	icon?: MentionItem["icon"]
	platform: MentionItemRendererPlatform
	fallback: JSX.Element
}) {
	const { icon, platform, fallback } = params
	if (typeof icon !== "string" || !icon) return fallback

	return <MagicAvatar src={icon} size={getRendererIconSize(platform)} />
}

export function renderMentionFolderIcon(context: MentionItemRendererContext) {
	const { item, platform } = context
	if (typeof item.icon !== "string") return item.icon ?? null
	if (item.icon !== "file-folder") return null

	const size = getRendererIconSize(platform)

	const data = item.data as DirectoryMentionData | undefined
	const presentation = resolveFilePresentation(
		{
			...data,
			file_id: data?.directory_id,
			file_name: data?.directory_name ?? item.name,
			relative_file_path: data?.directory_path,
			is_directory: true,
			display_config: data?.directory_metadata ?? item.displayConfig,
		},
		context.filePresentationOptions,
	)
	return <FileResourceIcon presentation={presentation} size={size} />
}

export function renderMentionFileIcon(context: MentionItemRendererContext) {
	const { item } = context
	if (typeof item.icon !== "string") return item.icon ?? null

	return <MentionPanelFileImageIcon context={context} />
}

export function renderMentionMappedIcon(context: MentionItemRendererContext) {
	const { item, platform } = context
	const { icon, type } = item
	if (typeof icon !== "string") return null

	const iconName = icon.startsWith("ts") ? icon : ICON_MAPPINGS[icon]
	if (platform === "desktop") {
		return (
			<div
				className={cn(
					"flex h-4 w-4 shrink-0 items-center justify-center text-xs",
					getDesktopIconClassName(type),
				)}
			>
				<TSIcon type={iconName as IconParkIconElement["name"]} size="16" />
			</div>
		)
	}

	return (
		<div className={type === "mcp" ? "mcp-icon" : type === "agent" ? "agent-icon" : ""}>
			<TSIcon type={iconName as IconParkIconElement["name"]} size="20" radius={8} />
		</div>
	)
}
