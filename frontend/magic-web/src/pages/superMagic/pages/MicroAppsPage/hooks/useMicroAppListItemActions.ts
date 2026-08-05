import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import type { MicroAppListItem } from "@/apis/modules/superMagic"
import magicToast from "@/components/base/MagicToaster/utils"
import { RoutePath } from "@/constants/routes"

interface UseMicroAppListItemActionsProps {
	renameApp: (appId: string, appName: string) => Promise<unknown>
	deleteApp: (appId: string) => Promise<unknown>
}

export function useMicroAppListItemActions({
	renameApp,
	deleteApp,
}: UseMicroAppListItemActionsProps) {
	const { t } = useTranslation("super")
	const [renameTarget, setRenameTarget] = useState<MicroAppListItem | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<MicroAppListItem | null>(null)
	const [renaming, setRenaming] = useState(false)
	const [deleting, setDeleting] = useState(false)

	const openInNewWindow = useCallback((app: MicroAppListItem) => {
		// 微应用路由位于当前集群路径下，新窗口必须沿用当前 clusterCode。
		const superPathIndex = window.location.pathname.indexOf("/super/")
		const clusterPath =
			superPathIndex >= 0 ? window.location.pathname.slice(0, superPathIndex) : ""
		const appPath = RoutePath.MicroApp.replace(":appId", encodeURIComponent(app.app_id))
		window.open(`${clusterPath}${appPath}`, "_blank", "noopener,noreferrer")
	}, [])

	const confirmRename = useCallback(
		async (appName: string) => {
			if (!renameTarget || renaming) return
			setRenaming(true)
			try {
				await renameApp(renameTarget.app_id, appName)
				magicToast.success(t("microAppsPage.actions.renameSuccess"))
				setRenameTarget(null)
			} catch (error) {
				console.error("Failed to rename micro app:", error)
				magicToast.error(t("microAppsPage.actions.renameFailed"))
			} finally {
				setRenaming(false)
			}
		},
		[renameApp, renameTarget, renaming, t],
	)

	const confirmDelete = useCallback(async () => {
		if (!deleteTarget || deleting) return
		setDeleting(true)
		try {
			await deleteApp(deleteTarget.app_id)
			magicToast.success(t("microAppsPage.actions.deleteSuccess"))
			setDeleteTarget(null)
		} catch (error) {
			console.error("Failed to delete micro app:", error)
			magicToast.error(t("microAppsPage.actions.deleteFailed"))
		} finally {
			setDeleting(false)
		}
	}, [deleteApp, deleteTarget, deleting, t])

	return {
		renameTarget,
		deleteTarget,
		renaming,
		deleting,
		openInNewWindow,
		openRename: setRenameTarget,
		openDelete: setDeleteTarget,
		closeRename: () => setRenameTarget(null),
		closeDelete: () => setDeleteTarget(null),
		confirmRename,
		confirmDelete,
	}
}
