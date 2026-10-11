import { Topic } from "@/pages/superMagic/pages/Workspace/types"
import type { JSONContent } from "@/infrastructure/editors/tiptap/core"
import {
	createContext,
	type MouseEvent,
	type PropsWithChildren,
	type ReactNode,
	useContext,
} from "react"
import defaultProjectFilesStore, { type ProjectFilesStore } from "@/stores/projectFiles"

export interface MessageListContextState {
	/** 消息正文转交列表级调试入口，不由虚拟消息行持有弹窗状态。 */
	onMessageDebugClick?: (node: unknown, event: MouseEvent<HTMLDivElement>) => void
	/** 仅登录的非分享会话解析当前用户的个人文件引用。 */
	allowUserFileReferences?: boolean
	/** 是否允许撤回 */
	allowRevoke?: boolean
	/** 是否允许用户消息复制 */
	allowUserMessageCopy?: boolean
	/** 是否允许创建定时任务 */
	allowScheduleTaskCreate?: boolean
	/** 是否允许悬浮消息节点显示时间 */
	allowMessageTooltip?: boolean
	/** 是否允许话题会话记录复制至新话题 */
	allowConversationCopy?: boolean
	/** 是否允许创建新话题 */
	allowCreateNewTopic?: boolean
	/** 是否允许"导出对话"入口 */
	allowExport?: boolean
	/** 当前是否处于导出选择模式 */
	exportModeActive?: boolean
	/** 触发进入导出选择模式（由 MessageList 内部注入） */
	onExportRequest?: () => void
	/** 切换当前话题 */
	onTopicSwitch?: (topic: Topic) => void
	/** 失败乐观消息重试 */
	onRetryOptimisticMessage?: (message: { app_message_id?: string }) => void
	/** Optional assistant avatar renderer for scoped scenes */
	renderAssistantAvatar?: (props?: { className?: string }) => ReactNode
	/** When false, hide the assistant "task completed" status badge */
	showTaskCompletedBadge?: boolean
	/** 当前上下文的 projectFilesStore。每个 MessageListProvider 都必须传入对应场景实例。 */
	projectFilesStore: ProjectFilesStore
}

const MessageListContext = createContext<MessageListContextState>({
	allowRevoke: false,
	allowUserMessageCopy: false,
	allowScheduleTaskCreate: false,
	allowMessageTooltip: false,
	allowConversationCopy: false,
	allowCreateNewTopic: true,
	allowExport: false,
	exportModeActive: false,
	onExportRequest: undefined,
	onTopicSwitch: undefined,
	renderAssistantAvatar: undefined,
	projectFilesStore: defaultProjectFilesStore,
})

export function useMessageListContext(): MessageListContextState {
	return useContext(MessageListContext)
}

/** MessageList 子树内的文件 store。子组件不要再 import `@/stores/projectFiles` 默认单例。 */
export function useMessageListProjectFilesStore(): ProjectFilesStore {
	return useMessageListContext().projectFilesStore
}

export function MessageListProvider(props: PropsWithChildren<{ value: MessageListContextState }>) {
	const { value, children } = props
	return <MessageListContext.Provider value={value}>{children}</MessageListContext.Provider>
}
