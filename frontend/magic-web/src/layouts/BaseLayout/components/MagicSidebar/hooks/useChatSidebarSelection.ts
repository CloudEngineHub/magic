import { matchPath, useLocation } from "react-router"
import { RoutePath } from "@/constants/routes"

/** Route parameters remain authoritative while the detail stores are still switching projects. */
export function useChatSidebarSelection() {
	const { pathname } = useLocation()
	const detail = matchPath(`/:clusterCode${RoutePath.SuperChatProjectState}`, pathname)
	return {
		isChatHome: Boolean(matchPath(`/:clusterCode${RoutePath.SuperChatHome}`, pathname)),
		projectId: detail?.params.projectId,
	}
}
