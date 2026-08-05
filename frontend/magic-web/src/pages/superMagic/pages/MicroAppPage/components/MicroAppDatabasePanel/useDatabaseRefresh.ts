import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

interface UseDatabaseRefreshOptions {
	refreshTables: () => Promise<unknown>
	refreshTable: () => Promise<unknown>
	refreshRows: () => Promise<unknown>
	refreshPermissions?: () => Promise<unknown>
}

export default function useDatabaseRefresh({
	refreshTables,
	refreshTable,
	refreshRows,
	refreshPermissions,
}: UseDatabaseRefreshOptions) {
	const { t } = useTranslation("super")
	const [refreshing, setRefreshing] = useState(false)
	const refreshingRef = useRef(false)

	const refresh = useCallback(async () => {
		if (refreshingRef.current) return
		refreshingRef.current = true
		setRefreshing(true)
		try {
			const results = await Promise.allSettled([
				refreshTables(),
				refreshTable(),
				refreshRows(),
				...(refreshPermissions ? [refreshPermissions()] : []),
			])
			if (results.some((result) => result.status === "rejected")) {
				throw new Error("Database refresh failed")
			}
			toast.success(t("refreshSuccess"))
		} catch {
			toast.error(t("refreshFailed"))
		} finally {
			refreshingRef.current = false
			setRefreshing(false)
		}
	}, [refreshPermissions, refreshRows, refreshTable, refreshTables, t])

	return { refreshing, refresh }
}
