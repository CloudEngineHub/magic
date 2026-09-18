/**
 * Open-source analytics boundary.
 *
 * The enterprise overlay mirrors this path and replaces these no-op exports
 * with the OpenPanel implementation. Shared code must import this stable path
 * so the open-source build never depends on enterprise-only modules.
 */
export type SkillSourceType = "empty" | "import" | "store"

export type ConnectorType = "sse" | "external_sse" | "external_http" | "external_stdio"
export type SharedContentType = "topic" | "project" | "file"
export type ConversationType =
	"chat" | "task" | "magic_claw" | "crew_edit" | "skill_edit" | "micro_app"
export type RecordingSource = "pc" | "h5"
export type RecordingAudioSource = "recorded" | "imported"
export type PendingEntityCreationScene = "crew" | "skill" | "magic_claw"

export interface PendingEntityCreationKey {
	scene: PendingEntityCreationScene
	resourceCode: string
}

export interface AnalyticsEventMap {
	signup: { signup_method: string }
	login: { login_method: string }
	agent_created: { agent_id: string }
	skill_created: { skill_code: string; source_type: SkillSourceType }
	connector_created: { connector_id: string; connector_type: ConnectorType }
	workspace_created: { workspace_id: string }
	workspace_project_created: { project_id: string; workspace_id: string }
	workspace_topic_created: { topic_id: string; project_id: string; workspace_id: string }
	chat_project_created: { project_id: string; workspace_id: string }
	chat_topic_created: { topic_id: string; project_id: string; workspace_id: string }
	ai_recording_project_created: { project_id: string; workspace_id?: string }
	ai_recording_topic_created: { topic_id: string; project_id: string; workspace_id?: string }
	crew_project_created: { project_id: string; workspace_id?: string }
	crew_topic_created: { topic_id: string; project_id: string; workspace_id?: string }
	magic_claw_project_created: { project_id: string; workspace_id?: string }
	magic_claw_topic_created: { topic_id: string; project_id: string; workspace_id?: string }
	micro_app_project_created: { project_id: string; workspace_id: string }
	micro_app_topic_created: { topic_id: string; project_id: string; workspace_id: string }
	skill_project_created: { project_id: string; workspace_id?: string }
	skill_topic_created: { topic_id: string; project_id: string; workspace_id?: string }
	content_shared: { content_type: SharedContentType; content_id: string }
	conversation_message_sent: {
		conversation_type: ConversationType
		topic_id?: string
		workspace_id?: string
		project_id?: string
		topic_mode?: string
	}
	ai_recording_started: {
		project_id: string
		source: RecordingSource
		audio_source: RecordingAudioSource
		transcription_enabled: boolean
	}
}

export function track<E extends keyof AnalyticsEventMap>(
	_event: E,
	_properties: AnalyticsEventMap[E],
): void {
	void _event
	void _properties
	// Analytics is an enterprise-only capability; the baseline build is intentionally inert.
}

export function setupAnalytics(): () => void {
	return () => undefined
}

export function refreshAnalyticsSubscription(): void {
	// The enterprise overlay refreshes the active organization's Group profile.
}

/** Enterprise persists this hand-off; the open-source edition intentionally does nothing. */
export async function markPendingEntityCreation(_key: PendingEntityCreationKey): Promise<void> {
	void _key
}

/** Enterprise atomically consumes this hand-off; no marker exists in the open-source edition. */
export async function takePendingEntityCreation(_key: PendingEntityCreationKey): Promise<boolean> {
	void _key
	return false
}
