import { useState } from "react"
import { Settings } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
	MobileShellSidebarToggleButton,
	SuperMobileShellRouteLayout,
	useOptionalSuperMobileShellOutlet,
} from "@/pages/superMagicMobile/components/MobileShell"
import AudioRecordingListPanel from "./AudioRecordingListPanel"
import { MobileRecordingSettingsSheet } from "./components/MobileRecordingSettingsSheet"

/**
 * Recordings quick-entry panel: mobile shell header + list panel wired to PC data layer.
 */
function AudioRecordingEntryPanel() {
	const { t } = useTranslation("super")
	const [settingsSheetOpen, setSettingsSheetOpen] = useState(false)

	return (
		<div
			data-testid="mobile-audio-entry-page"
			className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-mobile-background"
		>
			<div className="mobile-page-header">
				<MobileShellSidebarToggleButton testId="mobile-audio-entry-menu-button" />
				<p className="mobile-page-header-title">{t("mobile.shell.navRecording")}</p>
				<button
					type="button"
					onClick={() => setSettingsSheetOpen(true)}
					className="mobile-page-header-btn ml-auto transition-transform active:scale-95"
					aria-label={t("mobile.recordingEntry.settings.settingsAria")}
					data-testid="mobile-recording-settings-trigger"
				>
					<Settings className="size-[22px] text-foreground" />
				</button>
			</div>

			<AudioRecordingListPanel />
			<MobileRecordingSettingsSheet
				open={settingsSheetOpen}
				onOpenChange={setSettingsSheetOpen}
			/>
		</div>
	)
}

/**
 * Page entry mounts the unified Super mobile shell when rendered outside the app route layout.
 */
export default function AudioRecordingEntryPage() {
	const shellOutlet = useOptionalSuperMobileShellOutlet()
	const { t } = useTranslation("super")

	if (shellOutlet) {
		return <AudioRecordingEntryPanel />
	}

	return (
		<SuperMobileShellRouteLayout
			activeView="recording"
			closeSidebarAriaLabel={t("mobile.shell.closeSidebar")}
			testIdPrefix="mobile-audio-recordings-page"
		>
			<AudioRecordingEntryPanel />
		</SuperMobileShellRouteLayout>
	)
}
