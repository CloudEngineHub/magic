import i18next from "i18next"
import { logger as Logger } from "@/infrastructure/logger"
import { inboxIconForType } from "./mapNotification"
import {
	renderTemplate,
	renderTemplateParts,
	templateCatalogKey,
} from "./renderNotificationTemplate"
import type { InboxMessage } from "./types"

const logger = Logger.createLogger("InboxCopy")

function formatMappedValue(value: unknown, mapped: string | undefined) {
	if (value == null || value === "") return "-"
	return mapped ?? String(value)
}

export function formatInboxPayload(payload: Record<string, unknown>) {
	const permission = payload.permission
	const shareScope = payload.share_scope
	return {
		...payload,
		permission: formatMappedValue(
			permission,
			permission === "viewer"
				? i18next.t("inbox.permission.viewer", { ns: "sidebar" })
				: permission === "editor"
					? i18next.t("inbox.permission.editor", { ns: "sidebar" })
					: permission === "manager"
						? i18next.t("inbox.permission.manager", { ns: "sidebar" })
						: undefined,
		),
		share_scope: formatMappedValue(
			shareScope,
			shareScope === "all"
				? i18next.t("inbox.shareScope.all", { ns: "sidebar" })
				: shareScope === "specific"
					? i18next.t("inbox.shareScope.specific", { ns: "sidebar" })
					: undefined,
		),
	}
}

export function resolveInboxCopy(
	message: InboxMessage,
	templates: Record<string, { title_template: string; body_template: string }> | undefined,
) {
	const template = templates?.[templateCatalogKey(message.type, message.template_version)]
	const payload: Record<string, unknown> = formatInboxPayload(message.payload)
	if (message.type === "task_finished" || message.type === "task_failed") {
		// Match sidebar fallback names before substituting task notification templates.
		payload.workspace_name =
			message.payload.workspace_name ||
			i18next.t("workspace.unnamedWorkspace", { ns: "super" })
		payload.project_name =
			message.payload.project_name || i18next.t("project.unnamedProject", { ns: "super" })
	}
	if (!template) {
		logger.error({
			eventKey: "inbox_template_unavailable",
			errorKind: "client",
			message: "Notification template is missing from the catalog",
			context: { type: message.type, templateVersion: message.template_version },
		})
		return {
			title: message.type,
			body: i18next.t("inbox.templateUnavailable", { ns: "sidebar" }),
			bodyParts: undefined,
			unavailable: true,
			icon: inboxIconForType(message.type),
			payload,
		}
	}
	const bodyParts = renderTemplateParts(template.body_template, payload)
	return {
		title: renderTemplate(template.title_template, payload),
		body: bodyParts.map((part) => part.text).join(""),
		bodyParts,
		unavailable: false,
		icon: inboxIconForType(message.type),
		payload,
	}
}
