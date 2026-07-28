import { MessageStatus } from "@/pages/superMagic/pages/Workspace/types"

/**
 * Projects an already ordered canonical message list into the branch visible to users.
 * Historical revoked facts stay in Store; only the final contiguous revoked segment
 * represents the currently active revoke branch.
 */
export function projectVisibleMessagesByRevokedTail<T extends { status?: string }>(
	messages: readonly T[],
): T[] {
	if (messages.length === 0) return []

	if (messages[messages.length - 1]?.status !== MessageStatus.REVOKED) {
		return messages.filter((message) => message.status !== MessageStatus.REVOKED)
	}

	let activeRevokedSegmentStart = messages.length - 1
	while (
		activeRevokedSegmentStart > 0 &&
		messages[activeRevokedSegmentStart - 1]?.status === MessageStatus.REVOKED
	) {
		activeRevokedSegmentStart -= 1
	}

	return messages.filter(
		(message, index) =>
			message.status !== MessageStatus.REVOKED || index >= activeRevokedSegmentStart,
	)
}
