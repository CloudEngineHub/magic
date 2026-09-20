import { observer } from "mobx-react-lite"
import { useLocation } from "react-router"
import { userStore } from "@/models/user"
import Container from "../../components/MainInputContainer"
import { useFeaturedModeListRefreshOnAgentsPageMount } from "../../hooks/useFeaturedModeListRefresh"
import { useChatHomeContext } from "./useChatHomeContext"
import ChatConversationSwitcher from "./components/ChatConversationSwitcher"

const ChatHomeComposer = observer(function ChatHomeComposer() {
	const editorContext = useChatHomeContext()
	useFeaturedModeListRefreshOnAgentsPageMount()

	return (
		<div className="flex flex-1 flex-col items-center overflow-hidden rounded-xl border border-border bg-background">
			<div className="flex h-12 w-full shrink-0 items-center px-3">
				<ChatConversationSwitcher />
			</div>
			<Container editorContext={editorContext} />
		</div>
	)
})

export default observer(function ChatHomePage() {
	const location = useLocation()
	// Re-entering the composer or switching identity must never reuse a created conversation.
	const identity = `${userStore.user.userInfo?.user_id}:${userStore.user.organizationCode}`
	return <ChatHomeComposer key={`${identity}:${location.key}`} />
})
