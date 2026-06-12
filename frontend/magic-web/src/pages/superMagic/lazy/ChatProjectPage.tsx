import { lazy, Suspense } from "react"
import { useIsMobile } from "@/hooks/useIsMobile"
import ChatProjectPageMobileSkeleton from "./skeleton/ChatProjectPageMobileSkeleton"
import ChatProjectPageDesktopSkeleton from "./skeleton/ChatProjectPageDesktopSkeleton"

const ChatProjectPageMobile = lazy(() => import("@/pages/superMagicMobile/pages/ChatProjectPage"))
const ChatProjectPageDesktop = lazy(
	() => import("@/pages/superMagic/pages/ChatProjectPage/index.desktop"),
)

function ChatProjectPage() {
	const isMobile = useIsMobile()

	if (isMobile) {
		return (
			<Suspense fallback={<ChatProjectPageMobileSkeleton />}>
				<ChatProjectPageMobile />
			</Suspense>
		)
	}

	return (
		<Suspense fallback={<ChatProjectPageDesktopSkeleton />}>
			<ChatProjectPageDesktop />
		</Suspense>
	)
}

export default ChatProjectPage
