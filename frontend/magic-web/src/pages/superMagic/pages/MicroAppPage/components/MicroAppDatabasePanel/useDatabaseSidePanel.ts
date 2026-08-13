import { useCallback, useRef, useState } from "react"

import type { DatabaseSidePanel } from "./DatabaseSettingsSidePanel"

export default function useDatabaseSidePanel() {
	const [activeSidePanel, setActiveSidePanel] = useState<DatabaseSidePanel | null>(null)
	const [permissionDirty, setPermissionDirty] = useState(false)
	const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
	const pendingActionRef = useRef<(() => void) | null>(null)

	const runWithPermissionGuard = useCallback(
		(action: () => void) => {
			if (activeSidePanel === "permissions" && permissionDirty) {
				pendingActionRef.current = action
				setDiscardConfirmOpen(true)
				return
			}

			setPermissionDirty(false)
			action()
		},
		[activeSidePanel, permissionDirty],
	)

	const requestSidePanelChange = useCallback(
		(nextPanel: DatabaseSidePanel | null) => {
			runWithPermissionGuard(() => setActiveSidePanel(nextPanel))
		},
		[runWithPermissionGuard],
	)

	const discardPermissionChanges = useCallback(() => {
		const pendingAction = pendingActionRef.current
		pendingActionRef.current = null
		setDiscardConfirmOpen(false)
		setPermissionDirty(false)
		pendingAction?.()
	}, [])

	const continueEditing = useCallback(() => {
		pendingActionRef.current = null
		setDiscardConfirmOpen(false)
	}, [])

	const resetSidePanel = useCallback(() => {
		pendingActionRef.current = null
		setDiscardConfirmOpen(false)
		setPermissionDirty(false)
		setActiveSidePanel(null)
	}, [])

	return {
		activeSidePanel,
		discardConfirmOpen,
		setPermissionDirty,
		runWithPermissionGuard,
		requestSidePanelChange,
		discardPermissionChanges,
		continueEditing,
		resetSidePanel,
	}
}
