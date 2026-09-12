import type { ReactNode } from "react"
import {
	BookOpen,
	CalendarDays,
	FolderCog,
	History,
	ListTree,
	NotebookPen,
	Settings,
	Terminal,
	MessageSquare,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import DingTalkIcon from "@/components/base/MagicFileIcon/assets/dingtalk-logo.svg"
import LarkIcon from "@/components/base/MagicFileIcon/assets/feishu-logo.svg"
import IconSuperTeamshare from "@/enhance/tabler/icons-react/icons/IconSuperTeamshare"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import { ProjectResourceIcon } from "../TopicFilesButton/components/ProjectResourceIcon"
import { TopicFileIcon } from "../TopicFilesButton/components/TopicFileIcon"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import { TopicFileTag } from "../TopicFilesButton/components/TopicFileTag"
import { getUserResourceKind, type UserResourceKind } from "./userSpaceFilePresentation"

/** 图标和用途标签共用分类与解释；翻译保留静态键以支持提取和语言切换。 */
function useUserFilePresentation(item: AttachmentItem) {
	const { t } = useTranslation("super")
	const kind = getUserResourceKind(item)
	if (!kind) return undefined
	const labels: Record<UserResourceKind, () => string> = {
		magic: () => t("userSpace.fileLabels.magic"),
		instructions: () => t("userSpace.fileLabels.instructions"),
		memory: () => t("userSpace.fileLabels.memory"),
		coreMemory: () => t("userSpace.fileLabels.coreMemory"),
		notes: () => t("userSpace.fileLabels.notes"),
		references: () => t("userSpace.fileLabels.references"),
		timeline: () => t("userSpace.fileLabels.timeline"),
		year: () => t("userSpace.fileLabels.year"),
		month: () => t("userSpace.fileLabels.month"),
		index: () => t("userSpace.fileLabels.index"),
		subject: () => t("userSpace.fileLabels.subject"),
		event: () => t("userSpace.fileLabels.event"),
		topics: () => t("userSpace.fileLabels.topics"),
		dingtalk: () => t("userSpace.fileLabels.dingtalk"),
		lark: () => t("userSpace.fileLabels.lark"),
		teamshare: () => t("userSpace.fileLabels.teamshare"),
		tools: () => t("userSpace.fileLabels.tools"),
		cli: () => t("userSpace.fileLabels.cli"),
		settings: () => t("userSpace.fileLabels.settings"),
	}
	const descriptions: Record<UserResourceKind, () => string> = {
		magic: () => t("userSpace.fileHelp.magic"),
		instructions: () => t("userSpace.fileHelp.instructions"),
		memory: () => t("userSpace.fileHelp.memory"),
		coreMemory: () => t("userSpace.fileHelp.coreMemory"),
		notes: () => t("userSpace.fileHelp.notes"),
		references: () => t("userSpace.fileHelp.references"),
		timeline: () => t("userSpace.fileHelp.timeline"),
		year: () => t("userSpace.fileHelp.year"),
		month: () => t("userSpace.fileHelp.month"),
		index: () => t("userSpace.fileHelp.index"),
		subject: () => t("userSpace.fileHelp.subject"),
		event: () => t("userSpace.fileHelp.event"),
		topics: () => t("userSpace.fileHelp.topics"),
		dingtalk: () => t("userSpace.fileHelp.dingtalk"),
		lark: () => t("userSpace.fileHelp.lark"),
		teamshare: () => t("userSpace.fileHelp.teamshare"),
		tools: () => t("userSpace.fileHelp.tools"),
		cli: () => t("userSpace.fileHelp.cli"),
		settings: () => t("userSpace.fileHelp.settings"),
	}
	return { kind, label: labels[kind](), description: descriptions[kind]() }
}

export function UserSpaceFileTag({ item }: { item: AttachmentItem }) {
	const presentation = useUserFilePresentation(item)
	return presentation ? <TopicFileTag {...presentation} /> : null
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
	const presentation = useUserFilePresentation(item)
	const kind = presentation?.kind
	let icon: ReactNode = (
		<ProjectResourceIcon item={item} resourceTree={resourceTree} size={size} />
	)
	switch (kind) {
		case "memory":
		case "coreMemory":
			icon = (
				<TopicFileIcon
					magicVariant={item.is_directory ? "magic-memory" : "magic-file-memory"}
					size={size}
				/>
			)
			break
		case "notes":
			icon = <NotebookPen size={size} className="text-muted-foreground" />
			break
		case "references":
		case "subject":
			icon = <BookOpen size={size} className="text-muted-foreground" />
			break
		case "timeline":
		case "event":
			icon = <History size={size} className="text-muted-foreground" />
			break
		case "year":
		case "month":
			icon = <CalendarDays size={size} className="text-muted-foreground" />
			break
		case "index":
			icon = <ListTree size={size} className="text-muted-foreground" />
			break
		case "topics":
			icon = <MessageSquare size={size} className="text-muted-foreground" />
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
	if (!presentation) return icon
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className="inline-flex shrink-0 items-center justify-center"
					aria-label={presentation.description}
				>
					{icon}
				</span>
			</TooltipTrigger>
			<TooltipContent side="right" className="max-w-64">
				{presentation.description}
			</TooltipContent>
		</Tooltip>
	)
}
