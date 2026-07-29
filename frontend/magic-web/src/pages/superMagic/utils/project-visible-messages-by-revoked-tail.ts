import { MessageStatus } from "@/pages/superMagic/pages/Workspace/types"

interface RevokedProjectionMessage {
	status?: string
	role?: string
	seq_id?: string
	app_message_id?: string
	message_id?: string
}

export interface RevokedMessageBranchProjection<T> {
	/** Ordinary conversation flow after historical revoked turns are removed. */
	mainMessages: T[]
	/** Current editable revoked branch, including non-revoked Assistant and Tool descendants. */
	revokedBranchMessages: T[]
	/** Main flow followed by the current revoked branch; used by loading/share/send consumers. */
	visibleMessages: T[]
	/** Canonical index of the active User revoke anchor, or -1 when no branch is active. */
	activeRevokedAnchorIndex: number
}

function projectLegacyStatusTail<T extends RevokedProjectionMessage>(
	messages: readonly T[],
): RevokedMessageBranchProjection<T> {
	if (messages.length === 0) {
		return {
			mainMessages: [],
			revokedBranchMessages: [],
			visibleMessages: [],
			activeRevokedAnchorIndex: -1,
		}
	}

	if (messages[messages.length - 1]?.status !== MessageStatus.REVOKED) {
		const mainMessages = messages.filter((message) => message.status !== MessageStatus.REVOKED)
		return {
			mainMessages,
			revokedBranchMessages: [],
			visibleMessages: mainMessages,
			activeRevokedAnchorIndex: -1,
		}
	}

	let activeRevokedSegmentStart = messages.length - 1
	while (
		activeRevokedSegmentStart > 0 &&
		messages[activeRevokedSegmentStart - 1]?.status === MessageStatus.REVOKED
	) {
		activeRevokedSegmentStart -= 1
	}

	const mainMessages = messages
		.slice(0, activeRevokedSegmentStart)
		.filter((message) => message.status !== MessageStatus.REVOKED)
	const revokedBranchMessages = messages.slice(activeRevokedSegmentStart)

	return {
		mainMessages,
		revokedBranchMessages,
		visibleMessages: [...mainMessages, ...revokedBranchMessages],
		activeRevokedAnchorIndex: activeRevokedSegmentStart,
	}
}

function matchesRevokeAnchor(message: RevokedProjectionMessage, anchor: string) {
	return (
		message.seq_id === anchor ||
		message.app_message_id === anchor ||
		message.message_id === anchor
	)
}

/**
 * Projects ordered canonical messages by User-anchored conversation branches.
 * Assistant execution status and Tool read status never establish visibility boundaries;
 * they follow the User turn to avoid partially rendering or hiding one conversation round.
 */
export function projectRevokedMessageBranches<T extends RevokedProjectionMessage>(
	messages: readonly T[],
	activeRevokedAnchor?: string,
): RevokedMessageBranchProjection<T> {
	const userAnchorIndexes = messages.reduce<number[]>((indexes, message, index) => {
		if (message.role === "user") indexes.push(index)
		return indexes
	}, [])

	// Older/share fixtures may not carry roles. Preserve the ratified legacy status-tail
	// projection for those inputs instead of guessing turn ownership from incomplete data.
	if (userAnchorIndexes.length === 0) return projectLegacyStatusTail(messages)

	let activeRevokedAnchorIndex = -1
	if (activeRevokedAnchor) {
		activeRevokedAnchorIndex =
			userAnchorIndexes.find((index) =>
				matchesRevokeAnchor(messages[index], activeRevokedAnchor),
			) ?? -1
	}

	if (activeRevokedAnchorIndex < 0) {
		const lastUserAnchorOffset = userAnchorIndexes.length - 1
		const lastUserAnchorIndex = userAnchorIndexes[lastUserAnchorOffset]
		if (messages[lastUserAnchorIndex]?.status === MessageStatus.REVOKED) {
			activeRevokedAnchorIndex = lastUserAnchorIndex
			// One undo can revoke several trailing turns. Walk User anchors rather than
			// individual messages because Assistant/Tool statuses may remain read/running.
			for (let offset = lastUserAnchorOffset - 1; offset >= 0; offset -= 1) {
				const previousUserAnchorIndex = userAnchorIndexes[offset]
				if (messages[previousUserAnchorIndex]?.status !== MessageStatus.REVOKED) break
				activeRevokedAnchorIndex = previousUserAnchorIndex
			}
		}
	}

	const mainMessages: T[] = []
	const revokedBranchMessages: T[] = []
	let isHistoricalRevokedTurn = false

	messages.forEach((message, index) => {
		if (activeRevokedAnchorIndex >= 0 && index >= activeRevokedAnchorIndex) {
			revokedBranchMessages.push(message)
			return
		}

		if (message.role === "user") {
			isHistoricalRevokedTurn = message.status === MessageStatus.REVOKED
		}
		if (!isHistoricalRevokedTurn) mainMessages.push(message)
	})

	return {
		mainMessages,
		revokedBranchMessages,
		visibleMessages: [...mainMessages, ...revokedBranchMessages],
		activeRevokedAnchorIndex,
	}
}

export function projectVisibleMessagesByRevokedTail<T extends RevokedProjectionMessage>(
	messages: readonly T[],
	activeRevokedAnchor?: string,
): T[] {
	return projectRevokedMessageBranches(messages, activeRevokedAnchor).visibleMessages
}
