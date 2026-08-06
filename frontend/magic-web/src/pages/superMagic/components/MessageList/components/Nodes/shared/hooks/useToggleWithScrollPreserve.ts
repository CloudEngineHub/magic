import { useCallback } from "react"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { useMessageViewState } from "../../../../view-state/MessageViewStateContext"

/**
 * A toggle hook that suppresses the message list's auto-scroll-to-bottom
 * before the height change occurs, preventing scroll jumps when
 * panels are expanded/collapsed within the message list.
 */
export function useToggleWithScrollPreserve(
	initialOpen = false,
	controlKey = "tool-panel-expanded",
) {
	const [open, setOpen] = useMessageViewState(controlKey, initialOpen)
	const toggle = useCallback(() => {
		pubsub.publish(PubSubEvents.Message_Suppress_Auto_Scroll)
		setOpen((o) => !o)
	}, [setOpen])
	return [open, toggle, setOpen] as const
}
