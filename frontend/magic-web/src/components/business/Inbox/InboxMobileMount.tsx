import { useEffect } from "react"
import { observer } from "mobx-react-lite"
import InboxMobilePanel from "./InboxMobilePanel"
import { inboxStore } from "./store"

interface InboxMobileMountProps {
	onOpen?: () => void
}

/** Closes the mobile shell sidebar when the inbox overlay opens, without coupling panel UI to the layout store. */
const InboxMobileMount = observer(function InboxMobileMount({ onOpen }: InboxMobileMountProps) {
	useEffect(() => {
		if (inboxStore.visible) onOpen?.()
	}, [inboxStore.visible, onOpen])

	return <InboxMobilePanel />
})

export default InboxMobileMount
