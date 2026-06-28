import { optimisticMessageStore } from "./optimisticMessageStore"
import type {
	SuperMagicStoreCallbackRegistrar,
	SuperMagicStoreCollaborators,
	ServerMessagesConfirmedPayload,
} from "./types"

export const superMagicStoreCollaborators: SuperMagicStoreCollaborators = {
	getRestorableUserMessages(chat_topic_id) {
		return optimisticMessageStore.getRestorableMessages(chat_topic_id)
	},
	getMessageOptimisticStatus(chat_topic_id, app_message_id) {
		return optimisticMessageStore.getStatus(chat_topic_id, app_message_id)
	},
}

// Callback registration — SuperMagicStore is responsible for emitting events.
export function bindSuperMagicStoreCollaborators(storeRegistrar: SuperMagicStoreCallbackRegistrar) {
	return storeRegistrar.registerOnServerMessagesConfirmed(
		({ chat_topic_id, app_message_ids }: ServerMessagesConfirmedPayload) => {
			app_message_ids.forEach((app_message_id) => {
				optimisticMessageStore.confirm({ chat_topic_id, app_message_id })
			})
		},
	)
}
