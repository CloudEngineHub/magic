import { useRef } from "react"
import { ChevronDown, Mic, Settings, Upload } from "lucide-react"
import { useTranslation } from "react-i18next"
import AudioUploadAction from "@/components/business/RecordingSummary/AudioUploadAction"
import { Button } from "@/components/shadcn-ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"

interface AudioRecordingsPrimaryActionsProps {
	onOpenSettings: () => void
	onImportFiles?: (files: FileList) => void
	onStartRecording?: () => void
	isStartingRecording?: boolean
}

/** Renders the dropdown row that opens the stable desktop file picker. */
function DesktopAudioImportMenuItem({
	onOpenFilePicker,
	label,
}: {
	onOpenFilePicker: () => void
	label: string
}) {
	return (
		<DropdownMenuItem
			onClick={onOpenFilePicker}
			className="gap-2"
			data-testid="audio-recordings-import-menu-item"
		>
			<Upload className="size-4" aria-hidden />
			<span>{label}</span>
		</DropdownMenuItem>
	)
}

/** Desktop-only action cluster that separates creation actions from the filter toolbar. */
export function AudioRecordingsPrimaryActions({
	onOpenSettings,
	onImportFiles,
	onStartRecording,
	isStartingRecording = false,
}: AudioRecordingsPrimaryActionsProps) {
	const { t } = useTranslation("audioRecordings")
	const openFilePickerRef = useRef<() => void>(() => undefined)

	return (
		<div
			className="flex flex-wrap items-center justify-end gap-2"
			data-testid="audio-recordings-primary-actions"
		>
			{onImportFiles ? (
				<AudioUploadAction
					// Keep the hidden file input mounted outside the dropdown content so
					// the browser can still deliver the selected files after the menu closes.
					handler={(onUpload) => {
						openFilePickerRef.current = onUpload
						return null
					}}
					onFileChange={onImportFiles}
				/>
			) : null}

			{/* Keep recording as the dominant CTA while exposing upload through the adjacent menu. */}
			<DropdownMenu>
				<div className="flex items-center">
					<Button
						type="button"
						size="sm"
						className="h-9 rounded-r-none px-3.5"
						disabled={isStartingRecording || !onStartRecording}
						onClick={onStartRecording}
						data-testid="audio-recordings-start-recording-button"
					>
						<Mic className="size-4" aria-hidden />
						<span>{t("actions.startRecording")}</span>
					</Button>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							size="icon"
							className="h-9 w-9 rounded-l-none border-l border-primary-foreground/15 px-0"
							disabled={isStartingRecording}
							aria-label={t("card.moreActions")}
							data-testid="audio-recordings-start-recording-menu-trigger"
						>
							<ChevronDown className="size-4" aria-hidden />
						</Button>
					</DropdownMenuTrigger>
				</div>
				<DropdownMenuContent align="end" className="min-w-[160px]">
					{onImportFiles ? (
						<DesktopAudioImportMenuItem
							// The menu item only opens the stable picker; it must not own the
							// hidden input because dropdown teardown happens before file selection returns.
							onOpenFilePicker={() => openFilePickerRef.current()}
							label={t("card.sourceImported")}
						/>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Keep settings visible as a secondary action so recording remains the primary emphasis. */}
			<Button
				type="button"
				variant="outline"
				onClick={onOpenSettings}
				className="h-9 shrink-0 gap-1.5 rounded-lg bg-background px-3 shadow-xs"
				aria-label={t("super:mobile.recordingEntry.settings.title")}
				data-testid="audio-recordings-settings-button"
			>
				<Settings className="size-4" aria-hidden />
				{/* Reuse the dialog title key so the entry and modal stay semantically aligned. */}
				<span>{t("super:mobile.recordingEntry.settings.title")}</span>
			</Button>
		</div>
	)
}

export default AudioRecordingsPrimaryActions
