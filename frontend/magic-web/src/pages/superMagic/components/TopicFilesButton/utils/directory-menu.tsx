import {
	Download,
	FolderOpen,
	Info,
	MessageSquarePlus,
	MoveRight,
	Pencil,
	Trash2,
} from "lucide-react"
import type { TFunction } from "i18next"
import type { AttachmentItem } from "../hooks/types"
import type { TopicFilesMenuItem } from "./menu-items"

export interface DirectoryFileMenuActions {
	open: (file: AttachmentItem) => void
	addToChat?: (file: AttachmentItem) => void
	rename?: (file: AttachmentItem) => void
	move?: (file: AttachmentItem) => void
	remove?: (file: AttachmentItem) => void
	download?: (file: AttachmentItem) => void
	info?: (file: AttachmentItem) => void
}

/** 共享操作名称和菜单；每个空间只提供实际支持的动作。 */
export function getDirectoryFileMenu(
	file: AttachmentItem,
	actions: DirectoryFileMenuActions,
	t: TFunction,
	disabled = false,
): TopicFilesMenuItem[] {
	return [
		{
			key: "open",
			label: t("userSpace.open"),
			icon: <FolderOpen size={16} />,
			onClick: () => actions.open(file),
		},
		...(actions.addToChat
			? [
					{
						key: "addToChat",
						label: t("userSpace.addToChat"),
						icon: <MessageSquarePlus size={16} />,
						onClick: () => actions.addToChat?.(file),
					},
				]
			: []),
		...(actions.rename
			? [
					{
						key: "rename",
						disabled,
						label: t("userSpace.rename"),
						icon: <Pencil size={16} />,
						onClick: () => actions.rename?.(file),
					},
				]
			: []),
		...(actions.move
			? [
					{
						key: "move",
						disabled,
						label: t("userSpace.move"),
						icon: <MoveRight size={16} />,
						onClick: () => actions.move?.(file),
					},
				]
			: []),
		...(actions.remove
			? [
					{
						key: "delete",
						disabled,
						danger: true,
						label: t("userSpace.delete"),
						icon: <Trash2 size={16} />,
						onClick: () => actions.remove?.(file),
					},
				]
			: []),
		...(!file.is_directory && actions.download
			? [
					{
						key: "download",
						label: t("userSpace.download"),
						icon: <Download size={16} />,
						onClick: () => actions.download?.(file),
					},
				]
			: []),
		...(actions.info
			? [
					{
						key: "info",
						label: t("userSpace.info"),
						icon: <Info size={16} />,
						onClick: () => actions.info?.(file),
					},
				]
			: []),
	]
}
