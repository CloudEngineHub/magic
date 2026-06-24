import { getRoutePath } from "@/routes/history/helpers"
import { RouteName } from "@/routes/constants"
import { env } from "@/utils/env"

export const AI_CARD_DEEP_LINK_QUERY_PARAM = "ai_card"

interface AICardDeepLinkAttachmentNode {
	file_id?: string | number
	is_directory?: boolean
	display_config?: {
		type?: unknown
		card_id?: unknown
	}
	children?: AICardDeepLinkAttachmentNode[]
	[key: string]: unknown
}

export function createAICardId(): string {
	const randomUUID = globalThis.crypto?.randomUUID?.()
	if (randomUUID) return randomUUID
	return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function generateAICardDeepLink(
	projectId: string | null | undefined,
	topicId: string | null | undefined,
	cardId: string | null | undefined,
): string {
	if (!projectId || !topicId || !cardId) return ""

	const path = getRoutePath({
		name: RouteName.SuperWorkspaceProjectTopicState,
		params: {
			projectId,
			topicId,
		},
	})
	if (!path) return ""

	const domain = env("MAGIC_WEB_URL") || window.location.origin
	const url = new URL(path, domain)
	url.searchParams.set(AI_CARD_DEEP_LINK_QUERY_PARAM, cardId)
	return url.toString()
}

function findAICardFolderById(
	items: AICardDeepLinkAttachmentNode[] | undefined,
	cardId: string,
): AICardDeepLinkAttachmentNode | null {
	if (!items?.length) return null

	for (const item of items) {
		if (
			item?.is_directory === true &&
			item.display_config?.type === "ai-card" &&
			item.display_config?.card_id === cardId
		) {
			return item
		}

		const matched = findAICardFolderById(item.children, cardId)
		if (matched) return matched
	}

	return null
}

export function resolveAICardDeepLinkTarget(
	attachments: AICardDeepLinkAttachmentNode[] | undefined,
	cardId: string | null | undefined,
): { file: AICardDeepLinkAttachmentNode } | null {
	if (!cardId) return null

	const folder = findAICardFolderById(attachments, cardId)
	if (!folder?.file_id) return null

	const folderFileId = String(folder.file_id)
	return {
		file: {
			...folder,
			initialNavigation: {
				activeCardId: folderFileId,
				initialView: "detail",
			},
		},
	}
}
