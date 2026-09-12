import type { ReactNode } from "react"
import { FolderCog, Settings, Terminal } from "lucide-react"
import { useTranslation } from "react-i18next"
import DingTalkIcon from "@/components/base/MagicFileIcon/assets/dingtalk-logo.svg"
import LarkIcon from "@/components/base/MagicFileIcon/assets/feishu-logo.svg"
import IconSuperTeamshare from "@/enhance/tabler/icons-react/icons/IconSuperTeamshare"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import { ProjectResourceIcon } from "../TopicFilesButton/components/ProjectResourceIcon"
import { TopicFileIcon } from "../TopicFilesButton/components/TopicFileIcon"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import {
	isMagicSystemFolder,
	resolveProjectInstructionsFileKind,
} from "../TopicFilesButton/utils/magic-system-folder"
import { isFixedUserMemoryEntry } from "../LongTremMemory/components/memoryTreeNodeUtils"

type UserResourceKind =
	| "magic"
	| "instructions"
	| "memory"
	| "dingtalk"
	| "lark"
	| "teamshare"
	| "tools"
	| "cli"
	| "settings"

const DIRECTORY_KINDS: Readonly<Record<string, UserResourceKind>> = {
	".dws": "dingtalk",
	".local/share/dws-cli": "dingtalk",
	".lark-cli": "lark",
	".local/share/lark-cli": "lark",
	".magic/teamshare-cli": "teamshare",
	".local": "tools",
	".local/share": "tools",
	".magic/cli": "cli",
}

/** 固定目录按用户根下的完整路径识别；例如资料/cli 仍是普通目录。 */
function getResourceKind(item: AttachmentItem): UserResourceKind | undefined {
	const path = (item.file_reference?.space_relative_path ?? item.relative_file_path ?? "")
		.split("/")
		.filter(Boolean)
		.join("/")
	if (isMagicSystemFolder(item)) return "magic"
	if (resolveProjectInstructionsFileKind(item)) return "instructions"
	if (item.is_directory) {
		if (path === ".magic/memory") return "memory"
		return DIRECTORY_KINDS[path]
	}
	if (isFixedUserMemoryEntry(path, false)) return "memory"
	if (path === ".magic/super-magic.env") return "settings"
	return undefined
}

/** 树、列表和网格共享用户空间特例，其余文件直接复用项目资源图标。 */
export default function UserSpaceFileIcon({
	item,
	resourceTree,
	size = 16,
}: {
	item: AttachmentItem
	resourceTree: AttachmentItem[]
	size?: number
}) {
	const { t } = useTranslation("super")
	const kind = getResourceKind(item)
	let icon: ReactNode = (
		<ProjectResourceIcon item={item} resourceTree={resourceTree} size={size} />
	)
	switch (kind) {
		case "memory":
			icon = (
				<TopicFileIcon
					magicVariant={item.is_directory ? "magic-memory" : "magic-file-memory"}
					size={size}
				/>
			)
			break
		case "dingtalk":
			icon = <img src={DingTalkIcon} alt="" width={size} height={size} />
			break
		case "lark":
			icon = <img src={LarkIcon} alt="" width={size} height={size} />
			break
		case "teamshare":
			icon = <IconSuperTeamshare size={size} />
			break
		case "tools":
			icon = <FolderCog size={size} className="text-muted-foreground" />
			break
		case "cli":
			icon = <Terminal size={size} className="text-muted-foreground" />
			break
		case "settings":
			icon = <Settings size={size} className="text-muted-foreground" />
			break
	}
	if (!kind) return icon
	const descriptions: Record<UserResourceKind, string> = {
		magic: t("userSpace.fileHelp.magic"),
		instructions: t("userSpace.fileHelp.instructions"),
		memory: t("userSpace.fileHelp.memory"),
		dingtalk: t("userSpace.fileHelp.dingtalk"),
		lark: t("userSpace.fileHelp.lark"),
		teamshare: t("userSpace.fileHelp.teamshare"),
		tools: t("userSpace.fileHelp.tools"),
		cli: t("userSpace.fileHelp.cli"),
		settings: t("userSpace.fileHelp.settings"),
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className="inline-flex shrink-0 items-center justify-center"
					aria-label={descriptions[kind]}
				>
					{icon}
				</span>
			</TooltipTrigger>
			<TooltipContent side="right" className="max-w-64">
				{descriptions[kind]}
			</TooltipContent>
		</Tooltip>
	)
}
