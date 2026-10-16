import type { InboxMessage } from "./types"

function projectId(value: unknown): string | undefined {
	if (typeof value === "string") {
		const id = value.trim()
		return id && id !== "0" ? id : undefined
	}
	if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
		return String(value)
	}
	return undefined
}

export function getInboxProjectId(message: InboxMessage): string | undefined {
	const id = projectId(message.payload.project_id)
	if (id) return id

	// Only project notifications can use the generic resource ID as a project ID.
	if (message.type === "project_invitation" || message.type === "project_shared") {
		return projectId(message.payload.resource_id)
	}
	return undefined
}
