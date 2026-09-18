import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router"
import PublishedMicroAppPreviewSurface from "./components/PublishedMicroAppPreviewSurface"
import MicroAppInstallDialog from "./components/MicroAppInstallDialog"
import MicroAppShareHeader from "./components/MicroAppShareHeader"
import useMicroAppManifestLinks from "./hooks/useMicroAppManifestLinks"
import { usePublishedMicroAppPreview } from "./hooks/usePublishedMicroAppPreview"

export default function MicroAppSharePage() {
	const { appId = "" } = useParams<{ appId: string }>()
	useMicroAppManifestLinks(appId)
	// 分享页隐藏了 HTML 文件头，通过管理句柄复用预览内部的同一个授权面板。
	const [permissionManager, setPermissionManager] = useState<{ open: () => void } | null>(null)
	const preview = usePublishedMicroAppPreview({ appId })
	const {
		displayAppName,
		fullScreen,
		displayModeResolved,
		installFlow,
		hasConfirmedSafetyNotice,
	} = preview

	useEffect(() => {
		setPermissionManager(null)
	}, [appId])

	const handleLeave = useCallback(() => {
		window.location.replace("/")
	}, [])
	const handleOpenPermissionManager = useCallback(() => {
		permissionManager?.open()
	}, [permissionManager])

	if (preview.emptyStateInfo) {
		return (
			<PublishedMicroAppPreviewSurface
				preview={preview}
				onLeave={handleLeave}
				testIdPrefix="micro-app-share"
			/>
		)
	}

	return (
		<div
			className="flex h-screen w-screen flex-col overflow-hidden bg-background"
			data-testid="micro-app-share-page"
		>
			{displayModeResolved && !fullScreen ? (
				<MicroAppShareHeader
					appName={displayAppName}
					showInstall={installFlow.showInstall}
					showPermissionManager={hasConfirmedSafetyNotice && Boolean(permissionManager)}
					onInstall={installFlow.handleInstall}
					onOpenPermissionManager={handleOpenPermissionManager}
				/>
			) : null}
			<MicroAppInstallDialog {...installFlow.dialog} />
			<main className="min-h-0 flex-1 overflow-hidden">
				<PublishedMicroAppPreviewSurface
					preview={preview}
					onLeave={handleLeave}
					testIdPrefix="micro-app-share"
					onHtmlPermissionManagerChange={setPermissionManager}
				/>
			</main>
		</div>
	)
}
