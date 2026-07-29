import { MessageStatus } from "@/pages/superMagic/pages/Workspace/types"
import { projectVisibleMessagesByRevokedTail } from "./project-visible-messages-by-revoked-tail"

interface ShareableMessage {
	status?: string
}

/**
 * Returns true when the current visible branch contains at least one non-revoked message.
 */
export function isTopicShareAllowed(messages: ShareableMessage[] | null | undefined): boolean {
	if (!messages?.length) return false

	return projectVisibleMessagesByRevokedTail(messages).some(
		(message) => message.status !== MessageStatus.REVOKED,
	)
}
