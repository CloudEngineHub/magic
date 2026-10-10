import { observer } from "mobx-react-lite"
import { useIsMobile } from "@/hooks/useIsMobile"
import InboxMobilePanel from "./InboxMobilePanel"
import InboxPanel from "./InboxPanel"

const InboxContainer = observer(function InboxContainer() {
	const isMobile = useIsMobile()
	return isMobile ? <InboxMobilePanel /> : <InboxPanel />
})

export default InboxContainer
