import { MessageStatus } from "@/pages/superMagic/pages/Workspace/types"

interface ShareableMessage {
	status?: string
}

/**
 * Returns true when the topic has at least one shareable message before any REVOKED marker.
 */
export function isTopicShareAllowed(messages: ShareableMessage[] | null | undefined): boolean {
	if (!messages?.length) return false

	const revokedMessageIndex = messages.findIndex(
		(message) => message?.status === MessageStatus.REVOKED,
	)
	const shareableMessageCount =
		revokedMessageIndex === -1 ? messages.length : messages.slice(0, revokedMessageIndex).length

	return shareableMessageCount > 0
}
