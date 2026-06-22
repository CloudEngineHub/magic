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

/** Desktop-only action cluster that separates creation actions from the filter toolbar. */
export function AudioRecordingsPrimaryActions({
	onOpenSettings,
	onImportFiles,
	onStartRecording,
	isStartingRecording = false,
}: AudioRecordingsPrimaryActionsProps) {
	const { t } = useTranslation("audioRecordings")

	return (
		<div
			className="flex flex-wrap items-center justify-end gap-2"
			data-testid="audio-recordings-primary-actions"
		>
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
						<AudioUploadAction
							// Reuse the existing upload pipeline so the PC shell only changes layout, not behavior.
							handler={(onUpload) => (
								<DropdownMenuItem
									onClick={onUpload}
									className="gap-2"
									data-testid="audio-recordings-import-menu-item"
								>
									<Upload className="size-4" aria-hidden />
									<span>{t("card.sourceImported")}</span>
								</DropdownMenuItem>
							)}
							onFileChange={onImportFiles}
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
