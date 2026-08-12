import { useCallback, useState } from "react"
import { platformKey } from "@/utils/storage"

/** Stores one desktop recording-detail conversation preference for all recordings. */
export const RECORDING_DETAIL_CONVERSATION_PANEL_COLLAPSED_STORAGE_KEY = platformKey(
	"audio-recording-detail-conversation-panel-collapsed",
)

const DEFAULT_CONVERSATION_PANEL_COLLAPSED = true

/** Reads the persisted panel preference and falls back to the compact layout on failure. */
function readConversationPanelCollapsed(): boolean {
	if (typeof window === "undefined") return DEFAULT_CONVERSATION_PANEL_COLLAPSED

	try {
		const storedValue = window.localStorage.getItem(
			RECORDING_DETAIL_CONVERSATION_PANEL_COLLAPSED_STORAGE_KEY,
		)
		if (storedValue === "true") return true
		if (storedValue === "false") return false
	} catch {
		// Restricted webviews can reject localStorage access; preserve the default UI state.
	}

	return DEFAULT_CONVERSATION_PANEL_COLLAPSED
}

/** Persists a panel preference without allowing storage errors to interrupt the UI update. */
function persistConversationPanelCollapsed(collapsed: boolean): void {
	if (typeof window === "undefined") return

	try {
		window.localStorage.setItem(
			RECORDING_DETAIL_CONVERSATION_PANEL_COLLAPSED_STORAGE_KEY,
			String(collapsed),
		)
	} catch {
		// Quota limits and private browsing restrictions should not block panel interaction.
	}
}

interface UseRecordingDetailConversationPanelStateResult {
	isConversationPanelCollapsed: boolean
	toggleConversationPanel: () => void
	expandConversationPanel: () => void
}

/** Owns the recording-detail conversation panel state and its scene-level persistence. */
export function useRecordingDetailConversationPanelState(): UseRecordingDetailConversationPanelStateResult {
	const [isConversationPanelCollapsed, setIsConversationPanelCollapsed] = useState(
		readConversationPanelCollapsed,
	)

	/** Toggles the panel and saves the user's latest layout preference. */
	const toggleConversationPanel = useCallback(() => {
		setIsConversationPanelCollapsed((current) => {
			const next = !current
			persistConversationPanelCollapsed(next)
			return next
		})
	}, [])

	/** Expands the narrow rail and persists the explicit user preference. */
	const expandConversationPanel = useCallback(() => {
		setIsConversationPanelCollapsed(false)
		persistConversationPanelCollapsed(false)
	}, [])

	return {
		isConversationPanelCollapsed,
		toggleConversationPanel,
		expandConversationPanel,
	}
}
