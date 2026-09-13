import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import type { TopicStore } from "@/pages/superMagic/stores/core/topic"

export interface HostConversationContextValue {
	selectedProject?: ProjectListItem | null
	topicStore?: TopicStore
	ensureConversation?: () => Promise<{
		selectedProject: ProjectListItem
		topicStore: TopicStore
	} | null>
	/** Request the host editor to switch from development to preview mode. */
	requestPreviewMode?: () => Promise<boolean> | boolean
}

const HostConversationContext = createContext<HostConversationContextValue | null>(null)

interface HostConversationProviderProps {
	selectedProject?: ProjectListItem | null
	topicStore?: TopicStore
	ensureConversation?: HostConversationContextValue["ensureConversation"]
	requestPreviewMode?: HostConversationContextValue["requestPreviewMode"]
	children: ReactNode
}

/**
 * 宿主会话：用户当前所在项目 + 该会话的 topicStore。
 * 分享页不包这个 Provider，会话类 API 必须失败，不能回落到 origin。
 */
export function HostConversationProvider({
	selectedProject,
	topicStore,
	ensureConversation,
	requestPreviewMode,
	children,
}: HostConversationProviderProps) {
	const value = useMemo(
		() => ({ selectedProject, topicStore, ensureConversation, requestPreviewMode }),
		[ensureConversation, requestPreviewMode, selectedProject, topicStore],
	)

	return (
		<HostConversationContext.Provider value={value}>
			{children}
		</HostConversationContext.Provider>
	)
}

/** 没有 Provider 时视为没有 host，不要读全局 store。 */
export function useHostConversation(): HostConversationContextValue {
	return useContext(HostConversationContext) ?? {}
}
