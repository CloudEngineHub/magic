import type { FileScope } from "@/apis/modules/fileScope"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import type { ProjectListItem, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import type { AttachmentItem } from "./hooks/types"

/** 文件树在不同空间下可启用的交互能力。 */
export interface TopicFilesCapabilities {
	upload: boolean
	move: boolean
	replace: boolean
	share: boolean
	addToChat: boolean
	crossProject: boolean
	importFromOtherProject: boolean
	projectContentCreation: boolean
	multiSelect: boolean
}

/** 特殊文件空间加入对话时使用的上下文与 mention 构造规则。 */
export interface TopicFilesChatContext {
	selectedProject?: ProjectListItem | null
	selectedWorkspace?: Workspace | null
	createAttachmentMention?: (item: AttachmentItem) => TiptapMentionAttributes | null
}

/** 文件树空间配置。 */
export interface TopicFilesSpaceConfig {
	scope?: FileScope
	capabilities?: Partial<TopicFilesCapabilities>
	chatContext?: TopicFilesChatContext
}

/** 项目文件默认能力，未传空间配置时保持原有行为。 */
export const DEFAULT_TOPIC_FILES_CAPABILITIES: TopicFilesCapabilities = {
	upload: true,
	move: true,
	replace: true,
	share: true,
	addToChat: true,
	crossProject: true,
	importFromOtherProject: true,
	projectContentCreation: true,
	multiSelect: true,
}

/** 合并调用方传入的能力配置。 */
export function resolveTopicFilesCapabilities(
	capabilities?: Partial<TopicFilesCapabilities>,
): TopicFilesCapabilities {
	return {
		...DEFAULT_TOPIC_FILES_CAPABILITIES,
		...capabilities,
	}
}
