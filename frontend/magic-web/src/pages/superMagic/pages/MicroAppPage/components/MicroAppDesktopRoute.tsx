import { useEffect, type ComponentType } from "react"
import { useParams } from "react-router"
import { useTranslation } from "react-i18next"

import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"

import { AppStoreProvider } from "../context"
import { useMicroAppProjectResolver } from "../hooks/useMicroAppProjectResolver"
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
	const { t } = useTranslation("super")
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
			<div className="flex h-full w-full flex-col items-center justify-center gap-4">
				<p className="text-sm text-destructive">
					{error?.message || t("microAppPage.errors.loadFailed")}
				</p>
				<button
					type="button"
					className="text-sm text-primary hover:underline"
					onClick={() => navigate({ name: RouteName.MicroApps })}
				>
					{t("microAppPage.header.backToApps")}
				</button>
			</div>
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
