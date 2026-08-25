import { useEffect, useState } from "react"
import { baseHistory } from "@/routes/history"
import type { ProjectOrganizationAccessStatus } from "../contexts/ProjectOrganizationAccessContext"

interface UseProjectOrganizationAccessRouteRestoreParams {
	status: ProjectOrganizationAccessStatus
	restoreStateFromPathname: (pathname: string) => void
}

/** Defers cold-entry and POP restoration until the destination project is accessible. */
export function useProjectOrganizationAccessRouteRestore({
	status,
	restoreStateFromPathname,
}: UseProjectOrganizationAccessRouteRestoreParams) {
	const [pendingPathname, setPendingPathname] = useState<string | null>(
		() => baseHistory.location.pathname,
	)

	useEffect(() => {
		if (status !== "ready" || !pendingPathname) return

		const pathname = pendingPathname
		setPendingPathname(null)
		restoreStateFromPathname(pathname)
	}, [pendingPathname, restoreStateFromPathname, status])

	useEffect(
		() =>
			baseHistory.listen(({ action, location }) => {
				if (action === "POP") setPendingPathname(location.pathname)
			}),
		[],
	)
}
