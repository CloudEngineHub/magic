import { track } from "@/services/analytics"
import type {
	CreatedProject,
	ProjectListItem,
	Topic,
	Workspace,
} from "@/pages/superMagic/pages/Workspace/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { isAudioProjectMode } from "@/services/audioRecordings/audioProjectMode"

export type CreationScene =
	"workspace" | "chat" | "ai_recording" | "crew" | "magic_claw" | "micro_app" | "skill"

const PROJECT_CREATED_EVENT = {
	workspace: "workspace_project_created",
	chat: "chat_project_created",
	ai_recording: "ai_recording_project_created",
	crew: "crew_project_created",
	magic_claw: "magic_claw_project_created",
	micro_app: "micro_app_project_created",
	skill: "skill_project_created",
} as const satisfies Record<CreationScene, keyof import("@/services/analytics").AnalyticsEventMap>

const TOPIC_CREATED_EVENT = {
	workspace: "workspace_topic_created",
	chat: "chat_topic_created",
	ai_recording: "ai_recording_topic_created",
	crew: "crew_topic_created",
	magic_claw: "magic_claw_topic_created",
	micro_app: "micro_app_topic_created",
	skill: "skill_topic_created",
} as const satisfies Record<CreationScene, keyof import("@/services/analytics").AnalyticsEventMap>

function trimmed(value?: string | null): string | undefined {
	const result = value?.trim()
	return result || undefined
}

/**
 * Resolves the product surface that owns an entity creation. The scene lives in
 * the event name, so downstream reports never have to reinterpret a generic event.
 */
export function resolveCreationScene(mode?: string | null): CreationScene {
	const normalizedMode = trimmed(mode)
	if (isAudioProjectMode(normalizedMode)) return "ai_recording"
	if (normalizedMode === TopicMode.Chat) return "chat"
	if (
		normalizedMode === TopicMode.CrewCreator ||
		normalizedMode === TopicMode.CustomAgent ||
		normalizedMode?.startsWith("SMA")
	) {
		return "crew"
	}
	if (normalizedMode === TopicMode.SkillCreator) return "skill"
	if (normalizedMode === TopicMode.MagiClaw) return "magic_claw"
	if (normalizedMode === TopicMode.MicroApp) return "micro_app"
	return "workspace"
}

/** Reports a user-visible workspace after its create request succeeds. */
export function trackWorkspaceCreated(workspace?: Pick<Workspace, "id"> | null): void {
	const workspaceId = trimmed(workspace?.id)
	if (!workspaceId) return
	track("workspace_created", { workspace_id: workspaceId })
}

/** Reports a created topic when its owning project/workspace can be resolved. */
export function trackTopicCreated(
	topic?: Partial<Pick<Topic, "id" | "project_id" | "workspace_id" | "topic_mode">> | null,
	fallback?: {
		projectId?: string | null
		workspaceId?: string | null
		scene?: CreationScene
		mode?: string | null
	},
): void {
	const topicId = trimmed(topic?.id)
	const projectId = trimmed(topic?.project_id) ?? trimmed(fallback?.projectId)
	const workspaceId = trimmed(topic?.workspace_id) ?? trimmed(fallback?.workspaceId)
	const scene = fallback?.scene ?? resolveCreationScene(topic?.topic_mode ?? fallback?.mode)
	if (!topicId || !projectId) return

	if (
		scene === "ai_recording" ||
		scene === "crew" ||
		scene === "magic_claw" ||
		scene === "skill"
	) {
		// Ungrouped recordings and Crew/Claw/Skill-owned special projects intentionally may
		// have no workspace. Their stable project/topic identities are still valid events.
		track(TOPIC_CREATED_EVENT[scene], {
			topic_id: topicId,
			project_id: projectId,
			...(workspaceId ? { workspace_id: workspaceId } : {}),
		})
		return
	}

	if (!workspaceId) return
	track(TOPIC_CREATED_EVENT[scene], {
		topic_id: topicId,
		project_id: projectId,
		workspace_id: workspaceId,
	})
}

/**
 * Reports a project and its initial topic using the owning product surface's
 * dedicated events. These events replace the former generic create events.
 */
export function trackProjectCreated(
	result?: Pick<CreatedProject, "project" | "topic"> | null,
	fallbackWorkspaceId?: string | null,
	sceneOverride?: CreationScene,
): void {
	const project = result?.project as ProjectListItem | undefined
	const projectId = trimmed(project?.id)
	// Dedicated creation APIs (notably ungrouped audio recordings) may omit the
	// workspace on the project while still returning it on the initial topic.
	const workspaceId =
		trimmed(project?.workspace_id) ??
		trimmed(result?.topic?.workspace_id) ??
		trimmed(fallbackWorkspaceId)
	const scene =
		sceneOverride ?? resolveCreationScene(project?.project_mode || result?.topic?.topic_mode)
	if (!projectId) return

	if (
		scene === "ai_recording" ||
		scene === "crew" ||
		scene === "magic_claw" ||
		scene === "skill"
	) {
		// Ungrouped recordings and Crew/Claw/Skill-owned special projects may omit a workspace.
		track(PROJECT_CREATED_EVENT[scene], {
			project_id: projectId,
			...(workspaceId ? { workspace_id: workspaceId } : {}),
		})
		trackTopicCreated(result?.topic, { projectId, workspaceId, scene })
		return
	}

	if (!workspaceId) return
	track(PROJECT_CREATED_EVENT[scene], {
		project_id: projectId,
		workspace_id: workspaceId,
	})
	trackTopicCreated(result?.topic, { projectId, workspaceId, scene })
}
