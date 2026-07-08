import { useIsMobile } from "@/hooks/useIsMobile"
import AudioRecordingEntryPage from "@/pages/superMagicMobile/pages/AudioRecordingEntry"

import AudioRecordingsPageDesktop from "./index.desktop"

/**
 * Shared /recordings route entry: desktop keeps the existing list UI,
 * mobile viewport renders the new H5 quick-entry shell.
 */
export default function AudioRecordingsPage() {
	const isMobile = useIsMobile()

	if (isMobile) return <AudioRecordingEntryPage />

	return <AudioRecordingsPageDesktop />
}
