import { useIsMobile } from "@/hooks/useIsMobile"
import { lazy, Suspense, useEffect } from "react"
import { useMemoizedFn } from "ahooks"
import SuperMagicService from "../../services"
import { resolveSuperPopRefreshParams } from "../../utils/resolve-super-pop-refresh-params"
import GuideTourWrapper from "../../components/LazyGuideTour"
import { useProjectTitle } from "../../hooks/useTopicTitle"
import { baseHistory } from "@/routes/history"
import { useInterFont } from "@/styles/font"
import { isPrivateDeployment } from "@/utils/env"
import SketchWithoutLayout from "@/layouts/BaseLayout/components/Sketch/withoutLayout"
import { useFeaturedModeListRefreshOnDocumentVisible } from "../../hooks/useFeaturedModeListRefresh"
import EditionActivityModal from "@/components/business/EditionActivity/Modal"
import { MobileImagePreviewProvider } from "@/pages/superMagic/components/MessageEditor/components/AtItem/components/MobileImagePreview"
import { projectStore, topicStore, workspaceStore } from "../../stores/core"
import { shouldRestoreRouteStateFromMainLayout } from "../../services/topicProjectConsistency"

const MainLayoutDesktop = lazy(() => import("./index.desktop"))
const MainLayoutMobile = lazy(() => import("@/pages/superMagicMobile/layout/MainLayout"))

function MainLayout() {
	useInterFont() // Load Inter font for font-weight 600/700 rendering
	useFeaturedModeListRefreshOnDocumentVisible()

	const isMobile = useIsMobile()

	useProjectTitle()

	const restoreStateFromPathname = useMemoizedFn((pathname: string) => {
		const stateParams = resolveSuperPopRefreshParams(pathname)
		if (!stateParams) return

		const needsRestore = shouldRestoreRouteStateFromMainLayout({
			// ChatProjectPage owns chat route recovery; MainLayout must not start initializeState in parallel.
			isChatProjectRoute: SuperMagicService.route.isCurrentChatProjectRoute(),
			workspaceId: stateParams.workspaceId,
			projectId: stateParams.projectId,
			routeTopicId: stateParams.topicId,
			selectedWorkspaceId: workspaceStore.selectedWorkspace?.id,
			selectedProjectId: projectStore.selectedProject?.id,
			selectedTopic: topicStore.selectedTopic,
		})

		if (!needsRestore) return

		if (isMobile) {
			SuperMagicService.refreshState(stateParams)
		} else {
			SuperMagicService.initializeState(stateParams)
		}
	})

	// 暂时注释掉，因为 appInitPromise 会在 app 初始化完成后自动触发
	// 后续需要再恢复
	// // Ensure Super state is ready on route entry.
	// useMount(() => {
	// 	if (!appStore.appInitPromise) return
	// 	appStore.appInitPromise?.then(() => {
	// 		initializeSuperMagicIfNeeded({
	// 			isMobile,
	// 			workspaceId,
	// 			projectId,
	// 			topicId,
	// 		})
	// 	})
	// })

	// Listen to browser back/forward navigation
	useEffect(() => {
		restoreStateFromPathname(baseHistory.location.pathname)

		const unsubscribe = baseHistory.listen(({ action, location }) => {
			// Only handle POP action (browser back/forward)
			if (action === "POP") {
				restoreStateFromPathname(location.pathname)
			}
		})

		return () => {
			unsubscribe()
		}
	}, [isMobile, restoreStateFromPathname])

	const Content = isMobile ? MainLayoutMobile : MainLayoutDesktop

	return (
		<>
			<Suspense fallback={<SketchWithoutLayout />}>
				<Content />
			</Suspense>
			{isMobile && <MobileImagePreviewProvider />}
			{/* 新人引导教程 */}
			<GuideTourWrapper isMobile={isMobile} />
			{/* 私有化部署不显示活动弹窗 */}
			{!isPrivateDeployment() && <EditionActivityModal />}
		</>
	)
}

export default MainLayout
