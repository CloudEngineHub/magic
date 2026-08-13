import type { MenuProps } from "antd"
import { IconFolderPlus } from "@tabler/icons-react"
import { useMemo } from "react"
import type { TFunction } from "i18next"
import MagicFileIcon from "@/components/base/MagicFileIcon"
import MagicIcon from "@/components/base/MagicIcon"
import { useTranslation } from "react-i18next"
import { type PresetFileType } from "../../constant"

interface CreateFileMenuItemsParams {
	t: TFunction
	/**
	 * Callback when creating a file
	 * @param type - File type
	 */
	onAddFile?: (type: PresetFileType | "design") => void
	/**
	 * Optional callback for creating design project
	 * If provided, design file option will be included
	 */
	onAddDesign?: () => void
	/**
	 * Optional callback for creating self-media project
	 * If provided, self-media project option will be included
	 */
	onAddSelfMedia?: () => void
	/**
	 * Optional callback for creating AI card project
	 * If provided, AI card project option will be included
	 */
	onAddAICard?: () => void
	/**
	 * Optional callback for creating a folder
	 * If provided, folder option will be included
	 */
	onAddFolder?: () => void
}

/**
 * Factory function for generating file operation menu items
 * Includes create file submenu for various file types
 */
export function createFileMenuItems({
	t,
	onAddFile,
	onAddDesign,
	onAddSelfMedia,
	onAddAICard,
	onAddFolder,
}: CreateFileMenuItemsParams): MenuProps["items"] {
	return [
		...(onAddFolder
			? [
					{
						key: "createFolder",
						label: t("topicFiles.contextMenu.createFolder"),
						onClick: onAddFolder,
						icon: <MagicIcon component={IconFolderPlus} stroke={2} size={18} />,
					},
					{ type: "divider" as const },
				]
			: []),
		{
			key: "createTxt",
			label: t("topicFiles.contextMenu.createSubMenu.txtFile"),
			onClick: () => onAddFile?.("txt"),
			icon: <MagicFileIcon type="txt" size={18} />,
		},
		{
			key: "createMd",
			label: t("topicFiles.contextMenu.createSubMenu.mdFile"),
			onClick: () => onAddFile?.("md"),
			icon: <MagicFileIcon type="md" size={18} />,
		},
		{ type: "divider" as const },
		{
			key: "createHtml",
			label: t("topicFiles.contextMenu.createSubMenu.htmlFile"),
			onClick: () => onAddFile?.("html"),
			icon: <MagicFileIcon type="html" size={18} />,
		},
		{
			key: "createPython",
			label: t("topicFiles.contextMenu.createSubMenu.pythonFile"),
			onClick: () => onAddFile?.("py"),
			icon: <MagicFileIcon type="py" size={18} />,
		},
		{
			key: "createGo",
			label: t("topicFiles.contextMenu.createSubMenu.goFile"),
			onClick: () => onAddFile?.("go"),
			icon: <MagicFileIcon type="go" size={18} />,
		},
		{
			key: "createPhp",
			label: t("topicFiles.contextMenu.createSubMenu.phpFile"),
			onClick: () => onAddFile?.("php"),
			icon: <MagicFileIcon type="php" size={18} />,
		},
		{ type: "divider" as const },
		...(onAddDesign
			? [
					{
						key: "createDesign",
						label: t("topicFiles.contextMenu.createSubMenu.designFile"),
						onClick: () => onAddDesign(),
						icon: <MagicFileIcon type="design" size={18} />,
					},
				]
			: []),
		...(onAddSelfMedia
			? [
					{
						key: "createSelfMedia",
						label: t("topicFiles.contextMenu.createSubMenu.selfMediaFile"),
						onClick: () => onAddSelfMedia(),
						icon: <MagicFileIcon type="self-media" size={18} />,
					},
				]
			: []),
		...(onAddAICard
			? [
					{
						key: "createAICard",
						label: t("topicFiles.contextMenu.createSubMenu.aiCardFile"),
						onClick: () => onAddAICard(),
						icon: <MagicFileIcon type="ai-card" size={18} />,
					},
				]
			: []),
		...(onAddDesign || onAddSelfMedia || onAddAICard ? [{ type: "divider" as const }] : []),
		{
			key: "createCustom",
			label: t("topicFiles.contextMenu.createSubMenu.customFile"),
			onClick: () => onAddFile?.("customFile"),
			icon: <MagicFileIcon type="customFile" size={18} />,
		},
	]
}

interface UseFileMenuItemsParams {
	/**
	 * Callback when creating a file
	 * @param type - File type
	 */
	onAddFile?: (type: PresetFileType | "design") => void
	/**
	 * Optional callback for creating design project
	 * If provided, design file option will be included
	 */
	onAddDesign?: () => void
	/**
	 * Optional callback for creating self-media project
	 * If provided, self-media project option will be included
	 */
	onAddSelfMedia?: () => void
	/**
	 * Optional callback for creating AI card project
	 * If provided, AI card project option will be included
	 */
	onAddAICard?: () => void
	/**
	 * Optional callback for creating a folder
	 * If provided, folder option will be included
	 */
	onAddFolder?: () => void
}

/**
 * Hook for generating file operation menu items
 * Includes create file submenu for various file types
 */
function useFileMenuItems({
	onAddFile,
	onAddDesign,
	onAddSelfMedia,
	onAddAICard,
	onAddFolder,
}: UseFileMenuItemsParams): MenuProps["items"] {
	const { t } = useTranslation("super")

	// File operation menu items
	const fileMenuItems: MenuProps["items"] = useMemo(
		() =>
			createFileMenuItems({
				t,
				onAddFile,
				onAddDesign,
				onAddSelfMedia,
				onAddAICard,
				onAddFolder,
			}),
		[t, onAddFile, onAddDesign, onAddSelfMedia, onAddAICard, onAddFolder],
	)

	return fileMenuItems
}

export default useFileMenuItems
