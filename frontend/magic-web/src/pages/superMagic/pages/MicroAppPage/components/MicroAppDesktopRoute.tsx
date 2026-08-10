import { useEffect, type ComponentType } from "react"
import { useParams } from "react-router"

import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"

import { AppStoreProvider } from "../context"
import { useMicroAppProjectResolver } from "../hooks/useMicroAppProjectResolver"
import MicroAppFallbackState from "./MicroAppFallbackState"
import MicroAppPageLoadingState from "./MicroAppPageLoadingState"

interface MicroAppDesktopContentProps {
	appId: string
	projectId: string
	isPublished: boolean
	onPublishStatusChange: (published: boolean) => void
}

export default function MicroAppDesktopRoute({
	Content,
}: {
	Content: ComponentType<MicroAppDesktopContentProps>
}) {
	const { appId = "" } = useParams<{ appId: string }>()
	const navigate = useNavigate()
	const { projectId, isPublished, setIsPublished, loading, error } =
		useMicroAppProjectResolver(appId)

	useEffect(() => {
		if (!appId) {
			navigate({ name: RouteName.Super, replace: true })
		}
	}, [appId, navigate])

	if (!appId || loading) {
		return <MicroAppPageLoadingState testId="micro-app-resolver-loading" />
	}

	if (error || !projectId) {
		return (
			<MicroAppFallbackState
				variant={error?.kind === "permission" ? "permission" : "load"}
				onBack={() => navigate({ name: RouteName.MicroApps })}
			/>
		)
	}

	return (
		<AppStoreProvider>
			<Content
				appId={appId}
				projectId={projectId}
				isPublished={isPublished}
				onPublishStatusChange={setIsPublished}
			/>
		</AppStoreProvider>
	)
}
