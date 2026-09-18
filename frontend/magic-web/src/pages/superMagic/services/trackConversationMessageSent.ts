import { track, type ConversationType } from "@/services/analytics"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { ProjectListItem, Topic, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import type { SendMessageOptions } from "@/pages/superMagic/components/MessagePanel/types"

export type ConversationAnalyticsType = ConversationType

/**
 * Maps the send surface onto the six conversation buckets in the event plan.
 * Editor-specific modes win before the workspace's chat/task classification.
 */
export function resolveConversationType(input: {
	topicMode?: string | null
	workspaceType?: string | null
	isClawSurface?: boolean
	isInstantMessaging?: boolean
}): ConversationAnalyticsType | null {
	if (input.isInstantMessaging) return null

	const topicMode = input.topicMode ?? ""
	if (input.isClawSurface || topicMode === TopicMode.MagiClaw) return "magic_claw"
	if (topicMode === TopicMode.CrewCreator) return "crew_edit"
	if (topicMode === TopicMode.SkillCreator) return "skill_edit"
	if (topicMode === TopicMode.MicroApp) return "micro_app"
	if (input.workspaceType === "chat") return "chat"
	return "task"
}

function readTopicPattern(options?: SendMessageOptions): string | undefined {
	const topicPattern = options?.extra?.super_agent?.topic_pattern
	return typeof topicPattern === "string" ? topicPattern : undefined
}

const reportedMessageIds = new Set<string>()
const topicModeOverrides = new Map<string, { mode: string; registrations: number }>()
const conversationContexts = new Map<
	string,
	{
		topic: Topic
		project: ProjectListItem
		workspace?: Workspace | null
		topicMode?: string | null
	}
>()

const MAX_REPORTED_MESSAGE_IDS = 2000
const MAX_CONVERSATION_CONTEXTS = 200

function rememberBounded<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number): void {
	map.delete(key)
	map.set(key, value)
	if (map.size <= maxSize) return
	const oldestKey = map.keys().next().value as K | undefined
	if (oldestKey !== undefined) map.delete(oldestKey)
}

function rememberReportedMessage(messageKey: string): void {
	reportedMessageIds.delete(messageKey)
	reportedMessageIds.add(messageKey)
	if (reportedMessageIds.size <= MAX_REPORTED_MESSAGE_IDS) return
	const oldestKey = reportedMessageIds.values().next().value
	if (oldestKey) reportedMessageIds.delete(oldestKey)
}

/** Remembers the context needed when a queued message is acknowledged after navigation. */
export function rememberConversationContext(input: {
	topic?: Topic | null
	project?: ProjectListItem | null
	workspace?: Workspace | null
	topicMode?: string | null
}) {
	if (!input.topic?.id || !input.project?.id) return
	rememberBounded(
		conversationContexts,
		`${input.project.id}:${input.topic.id}`,
		{
			topic: input.topic,
			project: input.project,
			workspace: input.workspace,
			topicMode: input.topicMode,
		},
		MAX_CONVERSATION_CONTEXTS,
	)
}

export function getRememberedConversationContext(projectId: string, topicId: string) {
	return conversationContexts.get(`${projectId}:${topicId}`)
}

/**
 * Registers a surface-owned mode for transports whose queue acknowledgement
 * contains IDs only. ClawPlayground uses this because its editor intentionally
 * exposes Default mode while outbound messages are sent as MagiClaw.
 */
export function registerConversationTopicModeOverride(topicId: string, mode: string) {
	if (!topicId) return () => undefined

	const current = topicModeOverrides.get(topicId)
	topicModeOverrides.set(topicId, {
		mode,
		registrations: current?.mode === mode ? current.registrations + 1 : 1,
	})
	// Queue acknowledgements may arrive after the owning surface unmounts. Persist
	// the specialized mode in any cached context so delayed sends keep their type.
	for (const [key, context] of conversationContexts) {
		if (context.topic.id === topicId) {
			// Updating an existing Map key preserves iteration order; deleting and
			// re-inserting here would make this loop revisit the same entry forever.
			conversationContexts.set(key, { ...context, topicMode: mode })
		}
	}

	return () => {
		const registered = topicModeOverrides.get(topicId)
		if (!registered || registered.mode !== mode) return
		if (registered.registrations > 1) {
			topicModeOverrides.set(topicId, {
				...registered,
				registrations: registered.registrations - 1,
			})
			return
		}
		topicModeOverrides.delete(topicId)
	}
}

/**
 * Reports only after transport/backend confirmation. The queue intermediate
 * event and the direct chat response can race, so callers provide a stable ID
 * and this helper claims it before emitting the event.
 */
export function trackConversationMessageSent(input: {
	messageId: string
	topic?: Topic | null
	project?: ProjectListItem | null
	workspace?: Workspace | null
	workspaceId?: string | null
	options?: SendMessageOptions
	topicMode?: string | null
	isClawSurface?: boolean
	isInstantMessaging?: boolean
}): void {
	const messageKey = `${input.project?.id ?? ""}:${input.topic?.id ?? ""}:${input.messageId}`
	if (!input.messageId || reportedMessageIds.has(messageKey)) return

	const topicMode =
		topicModeOverrides.get(input.topic?.id ?? "")?.mode ??
		input.topicMode ??
		readTopicPattern(input.options) ??
		input.topic?.topic_mode
	const workspaceId =
		input.workspace?.id ?? input.workspaceId ?? input.project?.workspace_id ?? undefined
	const conversationType = resolveConversationType({
		topicMode,
		workspaceType: input.workspace?.workspace_type,
		isClawSurface: input.isClawSurface,
		isInstantMessaging: input.isInstantMessaging,
	})
	if (!conversationType) return

	const topicId = input.topic?.id
	if (!topicId) return

	rememberReportedMessage(messageKey)
	track("conversation_message_sent", {
		conversation_type: conversationType,
		topic_id: topicId,
		...(workspaceId && { workspace_id: workspaceId }),
		...(input.project?.id && { project_id: input.project.id }),
		...(topicMode && { topic_mode: topicMode }),
	})
}

/** Allows isolated tests to start with a fresh deduplication set. */
export function resetConversationMessageAnalyticsForTests() {
	reportedMessageIds.clear()
	topicModeOverrides.clear()
	conversationContexts.clear()
}
