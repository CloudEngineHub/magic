import { useEffect, useRef, useState } from "react"
import { Settings } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router"

import {
	MobileShellSidebarToggleButton,
	SuperMobileShellRouteLayout,
	useOptionalSuperMobileShellOutlet,
} from "@/pages/superMagicMobile/components/MobileShell"
import AudioRecordingListPanel from "./AudioRecordingListPanel"
import { MobileRecordingSettingsSheet } from "./components/MobileRecordingSettingsSheet"
import { MobileRecordingSessionPage } from "./components/MobileRecordingSessionPage"
import { useMobileRecordingEntryFacade } from "./hooks/useMobileRecordingEntryFacade"

/**
 * Recordings quick-entry panel: mobile shell header + list panel wired to PC data layer.
 */
function AudioRecordingEntryPanel() {
	const { t } = useTranslation("super")
	const [settingsSheetOpen, setSettingsSheetOpen] = useState(false)
	const location = useLocation()
	const facade = useMobileRecordingEntryFacade()
	const lastHandledDeletedProjectIdRef = useRef<string>("")

	useEffect(() => {
		const deletedProjectId = (location.state as { deletedProjectId?: string } | null)
			?.deletedProjectId
		if (!deletedProjectId) return
		if (deletedProjectId === lastHandledDeletedProjectIdRef.current) return

		lastHandledDeletedProjectIdRef.current = deletedProjectId
		facade.clearOptimisticItem(deletedProjectId)
	}, [facade, location.state])

	if (facade.presentation === "recording") {
		return (
			<MobileRecordingSessionPage
				title={facade.recordingTitle}
				duration={facade.duration}
				isPaused={facade.isPaused}
				isBusy={facade.isBusy}
				startupState={facade.startupState}
				startupErrorMessage={facade.startupErrorMessage}
				startupErrorDetail={facade.startupErrorDetail}
				transcriptMessages={facade.transcriptMessages}
				noteContent={facade.noteContent}
				onBack={facade.showList}
				onPause={() => void facade.pauseRecording()}
				onResume={() => void facade.resumeRecording()}
				onRetryStart={() => void facade.startRecording()}
				onFinish={() => void facade.finishRecording()}
				onCancel={() => void facade.cancelRecording()}
				onNoteChange={facade.updateNote}
				onRenameTitle={facade.renameRecordingTitle}
				WaveformComponent={facade.WaveformComponent}
				MessageListComponent={facade.MessageListComponent}
			/>
		)
	}

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

			<AudioRecordingListPanel
				isSessionActive={facade.isSessionActive}
				sessionTitle={facade.recordingTitle}
				sessionDuration={facade.duration}
				isSessionPaused={facade.isPaused}
				isSessionBusy={facade.isBusy}
				onResumeRecording={facade.showRecording}
				onStartRecording={() => void facade.startRecording()}
				onPauseRecording={() => void facade.pauseRecording()}
				onContinueRecording={() => void facade.resumeRecording()}
				onFinishRecording={() => void facade.finishRecording()}
				WaveformComponent={facade.WaveformComponent}
				optimisticItems={facade.optimisticItems}
				refreshToken={facade.refreshToken}
				onImportFiles={(files) => void facade.importAudioFiles(files)}
				isImporting={facade.isImporting}
				onResolveOptimisticItem={facade.clearOptimisticItem}
				onRetryUpload={facade.retryImport}
				AudioUploadActionComponent={facade.AudioUploadActionComponent}
			/>
			<MobileRecordingSettingsSheet
				open={settingsSheetOpen}
				onOpenChange={setSettingsSheetOpen}
			/>
		</div>
	)
}

const ObservedAudioRecordingEntryPanel = observer(AudioRecordingEntryPanel)

/**
 * Page entry mounts the unified Super mobile shell when rendered outside the app route layout.
 */
export default function AudioRecordingEntryPage() {
	const shellOutlet = useOptionalSuperMobileShellOutlet()
	const { t } = useTranslation("super")

	if (shellOutlet) {
		return <ObservedAudioRecordingEntryPanel />
	}

	return (
		<SuperMobileShellRouteLayout
			activeView="recording"
			closeSidebarAriaLabel={t("mobile.shell.closeSidebar")}
			testIdPrefix="mobile-audio-recordings-page"
		>
			<ObservedAudioRecordingEntryPanel />
		</SuperMobileShellRouteLayout>
	)
}
