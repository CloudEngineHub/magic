import { lazy, Suspense } from "react"
import { Loader2 } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useLocation, useParams } from "react-router-dom"
import { useIsMobile } from "@/hooks/useIsMobile"
import { CrewConversationStoreProvider } from "./context"
import {
	getCrewConversationRouteOrganizationCode,
	shouldForceMobileCrewConversation,
} from "./route-layout"
import { useCrewConversationOrganizationGuard } from "./hooks/useCrewConversationOrganizationGuard"
import CrewStateView from "./components/CrewStateView"

const CrewConversationDesktop = lazy(() => import("./index.desktop"))
const CrewConversationMobile = lazy(() => import("./index.mobile"))

function CrewConversationPage() {
	const { code } = useParams<{ code?: string }>()
	const { search } = useLocation()
	const isMobile = useIsMobile()
	const shouldUseMobileLayout = isMobile || shouldForceMobileCrewConversation(search)
	const routeOrganizationCode = getCrewConversationRouteOrganizationCode(search)
	const organizationGuard = useCrewConversationOrganizationGuard(routeOrganizationCode)

	if (!organizationGuard.isReady) {
		return <CrewStateView status={organizationGuard.status === "error" ? "error" : "loading"} />
	}

	return (
		<CrewConversationStoreProvider code={code}>
			<Suspense
				fallback={
					<div className="flex h-full w-full items-center justify-center bg-background">
						<Loader2 className="size-8 animate-spin text-muted-foreground" />
					</div>
				}
			>
				{shouldUseMobileLayout ? <CrewConversationMobile /> : <CrewConversationDesktop />}
			</Suspense>
		</CrewConversationStoreProvider>
	)
}

export default observer(CrewConversationPage)
