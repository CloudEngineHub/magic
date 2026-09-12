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
import DingTalkIcon from "@/components/base/MagicFileIcon/assets/dingtalk-logo.svg"
import LarkIcon from "@/components/base/MagicFileIcon/assets/feishu-logo.svg"
import IconSuperTeamshare from "@/enhance/tabler/icons-react/icons/IconSuperTeamshare"
import { ProjectResourceIcon } from "../TopicFilesButton/components/ProjectResourceIcon"
import { TopicFileIcon } from "../TopicFilesButton/components/TopicFileIcon"
import type { AttachmentItem } from "../TopicFilesButton/hooks/types"
import { TopicFileTag } from "../TopicFilesButton/components/TopicFileTag"
import { getUserResourceKind } from "./userSpaceFilePresentation"
import { useUserFileHelp } from "./useUserFileHelp"

export function UserSpaceFileTag({ item }: { item: AttachmentItem }) {
	const presentation = useUserFileHelp(item)
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
	const kind = getUserResourceKind(item)
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
	return icon
}
