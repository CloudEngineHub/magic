import { RoutePath } from "@/constants/routes"
import { RouteName } from "@/routes/constants"
import { fillRoute, getRoutePath } from "@/routes/history/helpers"
import { logger as Logger } from "@/infrastructure/logger"
import type { InboxMessage } from "./types"

const logger = Logger.createLogger("InboxRoute")

function routeValue(value: unknown): string | undefined {
	if (typeof value === "string") {
		const text = value.trim()
		return text && text !== "0" ? text : undefined
	}
	if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value)
	return undefined
}

export function getInboxResourceRoute(message: InboxMessage) {
	const payload = message.payload
	const isTask =
		message.type === "task_finished" ||
		message.type === "task_failed" ||
		message.type.startsWith("task.") ||
		(typeof payload.event_type === "string" && payload.event_type.startsWith("task."))
	const isShare =
		message.type === "project_shared" ||
		message.type === "file_shared" ||
		[message.type, payload.event_type].some(
			(value) =>
				typeof value === "string" &&
				(value.startsWith("share.project.") || value.startsWith("share.file.")),
		)
	const resourceType = payload.resource_type
	const shareCode = routeValue(payload.share_code)
	const id = routeValue(payload.resource_id)
	const code = routeValue(payload.resource_code)
	const projectId = routeValue(payload.project_id)
	const topicId = routeValue(payload.topic_id)
	const nameFields =
		resourceType === "project" ? ["resource_name", "project_name"] : ["resource_name"]
	const route = (name: RouteName, params: Record<string, string>) =>
		getRoutePath({
			name,
			params: Object.fromEntries(
				Object.entries(params).map(([key, value]) => [key, encodeURIComponent(value)]),
			),
		})
	let path: string | null | undefined
	// Share codes are access identifiers; database IDs and passwords must never replace them.
	if (shareCode) {
		path = fillRoute(RoutePath.SuperMagicFilesShare, {
			resourceId: encodeURIComponent(shareCode),
		})
	} else if (!isShare) {
		switch (resourceType) {
			case "project":
				// Claw codes are not project IDs; never fall back to a /super route for a Claw.
				if (payload.project_mode === "magiclaw") {
					if (code) path = route(RouteName.ClawPlayground, { code })
				} else if (isTask) {
					if (projectId && topicId)
						path = route(RouteName.SuperWorkspaceProjectTopicState, {
							projectId,
							topicId,
						})
				} else if (id) {
					path = route(RouteName.SuperWorkspaceProjectState, { projectId: id })
				}
				break
			case "micro_app":
				if (id) path = route(RouteName.MicroApp, { appId: id })
				break
			case "agent":
				if (code) path = route(RouteName.CrewConversation, { code })
				break
			case "skill":
				if (code) path = route(RouteName.SkillEdit, { code })
				break
			// Other file messages need their own routing contract, not a guessed share URL.
		}
	}
	if (!path) {
		logger.warn({
			eventKey: "inbox_route_unavailable",
			message: "Notification resource is missing required route parameters",
			context: { notificationId: message.id, type: message.type, resourceType },
		})
		return undefined
	}
	return { path, nameFields }
}
