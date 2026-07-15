import { isUserRoleMessage } from "../../message-turn-groups"
import type { SuperMagicMessageItem } from "../../type"

interface ConversationMessageLike {
	app_message_id?: string
	role?: string
}

/**
 * Resolves the user turn that owns the clicked assistant card.
 * The slice ends immediately before the next user message so a manual report
 * contains the complete current turn without leaking the following turn.
 */
export function getCurrentConversationRound<T extends ConversationMessageLike>(
	messages: T[],
	currentMessageId?: string,
): T[] {
	if (!currentMessageId) return []

	const currentIndex = messages.findIndex(
		(message) => message.app_message_id === currentMessageId,
	)
	if (currentIndex < 0) return []

	let startIndex = currentIndex
	while (startIndex >= 0 && !isUserRoleMessage(messages[startIndex] as SuperMagicMessageItem)) {
		startIndex -= 1
	}
	if (startIndex < 0) return []

	let endIndex = currentIndex + 1
	while (
		endIndex < messages.length &&
		!isUserRoleMessage(messages[endIndex] as SuperMagicMessageItem)
	) {
		endIndex += 1
	}

	return messages.slice(startIndex, endIndex)
}
