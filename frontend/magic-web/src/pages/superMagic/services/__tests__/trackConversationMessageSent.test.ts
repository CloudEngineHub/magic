import { beforeEach, describe, expect, it, vi } from "vitest"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { ProjectListItem, Topic, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import {
	getRememberedConversationContext,
	rememberConversationContext,
	registerConversationTopicModeOverride,
	resetConversationMessageAnalyticsForTests,
	resolveConversationType,
	trackConversationMessageSent,
} from "../trackConversationMessageSent"

const { track } = vi.hoisted(() => ({ track: vi.fn() }))

vi.mock("@/services/analytics", () => ({ track }))

function topic(overrides: Partial<Topic> = {}): Topic {
	return {
		id: "topic-1",
		user_id: "u1",
		chat_topic_id: "chat-topic",
		chat_conversation_id: "conv",
		topic_name: "t",
		task_status: "waiting" as Topic["task_status"],
		task_mode: "chat",
		project_id: "project-1",
		topic_mode: TopicMode.General,
		updated_at: "",
		workspace_id: "ws-1",
		token_used: null,
		...overrides,
	}
}

function project(overrides: Partial<ProjectListItem> = {}): ProjectListItem {
	return {
		id: "project-1",
		project_status: "waiting" as ProjectListItem["project_status"],
		project_mode: TopicMode.General,
		workspace_id: "ws-1",
		work_dir: "",
		workspace_name: "ws",
		project_name: "p",
		current_topic_id: "topic-1",
		current_topic_status: "",
		created_at: "",
		updated_at: "",
		tag: "",
		...overrides,
	}
}

describe("resolveConversationType", () => {
	it("maps specialized surfaces before workspace buckets", () => {
		expect(resolveConversationType({ topicMode: TopicMode.MagiClaw })).toBe("magic_claw")
		expect(resolveConversationType({ isClawSurface: true })).toBe("magic_claw")
		expect(resolveConversationType({ topicMode: TopicMode.CrewCreator })).toBe("crew_edit")
		expect(resolveConversationType({ topicMode: TopicMode.SkillCreator })).toBe("skill_edit")
		expect(resolveConversationType({ topicMode: TopicMode.MicroApp })).toBe("micro_app")
	})

	it("maps chat workspace to chat and everything else to task", () => {
		expect(resolveConversationType({ workspaceType: "chat" })).toBe("chat")
		expect(resolveConversationType({ workspaceType: "default" })).toBe("task")
		expect(resolveConversationType({})).toBe("task")
	})

	it("classifies CustomAgent by its workspace", () => {
		expect(
			resolveConversationType({
				topicMode: TopicMode.CustomAgent,
				workspaceType: "chat",
			}),
		).toBe("chat")
	})

	it("skips instant messaging", () => {
		expect(resolveConversationType({ isInstantMessaging: true })).toBeNull()
	})
})

describe("trackConversationMessageSent", () => {
	beforeEach(() => {
		track.mockReset()
		resetConversationMessageAnalyticsForTests()
	})

	it("tracks all six documented conversation buckets with ids", () => {
		trackConversationMessageSent({
			messageId: "message-chat",
			topic: topic({ topic_mode: TopicMode.Chat }),
			project: project({ workspace_id: "chat-workspace" }),
			workspace: { id: "chat-workspace", workspace_type: "chat" } as Workspace,
		})
		trackConversationMessageSent({
			messageId: "message-task",
			topic: topic({ id: "topic-task" }),
			project: project(),
			workspace: { id: "ws-1", workspace_type: "default" } as Workspace,
		})
		trackConversationMessageSent({
			messageId: "message-claw",
			topic: topic({ id: "topic-claw" }),
			project: project(),
			options: { extra: { super_agent: { topic_pattern: TopicMode.MagiClaw } } },
		})
		trackConversationMessageSent({
			messageId: "message-crew",
			topic: topic({ id: "topic-crew", topic_mode: TopicMode.CrewCreator }),
			project: project(),
		})
		trackConversationMessageSent({
			messageId: "message-skill",
			topic: topic({ id: "topic-skill", topic_mode: TopicMode.SkillCreator }),
			project: project(),
		})
		trackConversationMessageSent({
			messageId: "message-micro-app",
			topic: topic({ id: "topic-micro-app", topic_mode: TopicMode.MicroApp }),
			project: project(),
		})

		expect(track).toHaveBeenCalledTimes(6)
		expect(track).toHaveBeenNthCalledWith(1, "conversation_message_sent", {
			conversation_type: "chat",
			topic_id: "topic-1",
			workspace_id: "chat-workspace",
			project_id: "project-1",
			topic_mode: TopicMode.Chat,
		})
		expect(track.mock.calls[1]?.[1]).toMatchObject({
			conversation_type: "task",
			topic_id: "topic-task",
		})
		expect(track.mock.calls[2]?.[1]).toMatchObject({
			conversation_type: "magic_claw",
			topic_id: "topic-claw",
			topic_mode: TopicMode.MagiClaw,
		})
		expect(track.mock.calls[3]?.[1]).toMatchObject({
			conversation_type: "crew_edit",
			topic_id: "topic-crew",
		})
		expect(track.mock.calls[4]?.[1]).toMatchObject({
			conversation_type: "skill_edit",
			topic_id: "topic-skill",
		})
		expect(track.mock.calls[5]?.[1]).toMatchObject({
			conversation_type: "micro_app",
			topic_id: "topic-micro-app",
			topic_mode: TopicMode.MicroApp,
		})
	})

	it("does not track without a topic id", () => {
		trackConversationMessageSent({
			messageId: "message-no-topic",
			topic: topic({ id: "" }),
			project: project(),
		})
		expect(track).not.toHaveBeenCalled()
	})

	it("deduplicates the same confirmed queue message", () => {
		const payload = {
			messageId: "queue:project-1:topic-1:message-1",
			topic: topic(),
			project: project(),
			workspace: { id: "ws-1", workspace_type: "default" } as Workspace,
		}
		trackConversationMessageSent(payload)
		trackConversationMessageSent(payload)
		expect(track).toHaveBeenCalledTimes(1)
	})

	it("uses a Claw surface override for queue acknowledgements", () => {
		const unregister = registerConversationTopicModeOverride("topic-1", TopicMode.MagiClaw)
		trackConversationMessageSent({
			messageId: "queue:project-1:topic-1:message-2",
			topic: topic(),
			project: project(),
			workspace: { id: "ws-1", workspace_type: "default" } as Workspace,
			topicMode: TopicMode.Default,
		})
		unregister()

		expect(track).toHaveBeenCalledWith(
			"conversation_message_sent",
			expect.objectContaining({ conversation_type: "magic_claw" }),
		)
	})

	it("retains the original context for a delayed queue acknowledgement", () => {
		rememberConversationContext({
			topic: topic({ id: "topic-delayed" }),
			project: project({ id: "project-delayed" }),
			workspace: { id: "ws-delayed", workspace_type: "default" } as Workspace,
			topicMode: TopicMode.General,
		})

		const context = getRememberedConversationContext("project-delayed", "topic-delayed")
		trackConversationMessageSent({
			messageId: "queue:project-delayed:topic-delayed:message-3",
			...context,
		})

		expect(track).toHaveBeenCalledWith(
			"conversation_message_sent",
			expect.objectContaining({
				topic_id: "topic-delayed",
				project_id: "project-delayed",
				workspace_id: "ws-delayed",
			}),
		)
	})

	it("retains a Claw override after the surface unmounts", () => {
		rememberConversationContext({
			topic: topic({ id: "topic-claw-delayed" }),
			project: project({ id: "project-claw-delayed" }),
			workspace: { id: "ws-claw", workspace_type: "default" } as Workspace,
			topicMode: TopicMode.Default,
		})
		const unregister = registerConversationTopicModeOverride(
			"topic-claw-delayed",
			TopicMode.MagiClaw,
		)
		unregister()

		const context = getRememberedConversationContext(
			"project-claw-delayed",
			"topic-claw-delayed",
		)
		trackConversationMessageSent({ messageId: "message-delayed", ...context })

		expect(track).toHaveBeenCalledWith(
			"conversation_message_sent",
			expect.objectContaining({ conversation_type: "magic_claw" }),
		)
	})
})
