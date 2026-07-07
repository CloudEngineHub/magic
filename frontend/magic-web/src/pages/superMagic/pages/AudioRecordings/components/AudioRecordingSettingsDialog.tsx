import { useTranslation } from "react-i18next"
import { Settings, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/shadcn-ui/dialog"
import { Switch } from "@/components/shadcn-ui/switch"
import LanguageModelSwitch from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/LanguageModelSwitch"
import { useRecordingSettings } from "../hooks/useRecordingSettings"

interface AudioRecordingSettingsDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Settings modal for PC recording preferences.
 * Implements a clean, flat form list matching user preferences styling,
 * and embeds LanguageModelSwitch for model selection.
 */
export function AudioRecordingSettingsDialog({
	open,
	onOpenChange,
}: AudioRecordingSettingsDialogProps) {
	const { t } = useTranslation(["super", "audioRecordings"])

	// Load settings, models and current selected model via hook
	const {
		settings,
		summaryModels,
		summaryModelGroups,
		selectedModel,
		isLoading,
		isSaving,
		updateSetting,
	} = useRecordingSettings({ enabled: open })

	// Show loading spinner when settings are loading
	const shouldShowLoading =
		!settings || (isLoading && summaryModelGroups.length === 0 && summaryModels.length === 0)

	/**
	 * Handles model selection changes and updates the backend topic settings
	 */
	const handleModelSelect = async (modelId: string) => {
		if (isSaving || !settings) return
		await updateSetting("model_id", modelId)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-[480px]"
				data-testid="audio-recording-settings-dialog"
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Settings className="h-5 w-5 text-foreground" />
						<span>{t("super:mobile.recordingEntry.settings.title")}</span>
					</DialogTitle>
				</DialogHeader>

				{shouldShowLoading ? (
					<div className="flex h-40 items-center justify-center">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				) : (
					<div className="flex flex-col px-1">
						{/* Row 1: Auto Transcription Switch */}
						<div className="flex items-start justify-between gap-4 border-b border-border py-4">
							<div className="flex flex-col gap-1">
								<span className="text-sm font-medium text-foreground">
									{t(
										"super:mobile.recordingEntry.settings.transcriptionEnabled.label",
									)}
								</span>
								<span className="max-w-[280px] text-xs leading-normal text-muted-foreground">
									{t(
										"super:mobile.recordingEntry.settings.transcriptionEnabled.description",
									)}
								</span>
							</div>
							<Switch
								checked={settings.transcription_enabled}
								onCheckedChange={(checked) => {
									// Match mobile: use isSaving as a logic lock only, not disabled UI,
									// so other rows stay visually stable while one setting persists.
									if (isSaving) return
									void updateSetting("transcription_enabled", checked)
								}}
								data-testid="recording-setting-transcription-enabled"
							/>
						</div>

						{/* Row 2: Auto Summary Switch */}
						<div className="flex items-start justify-between gap-4 border-b border-border py-4">
							<div className="flex flex-col gap-1">
								<span className="text-sm font-medium text-foreground">
									{t(
										"super:mobile.recordingEntry.settings.autoSummaryEnabled.label",
									)}
								</span>
								<span className="max-w-[280px] text-xs leading-normal text-muted-foreground">
									{t(
										"super:mobile.recordingEntry.settings.autoSummaryEnabled.description",
									)}
								</span>
							</div>
							<Switch
								checked={settings.auto_summary_enabled}
								onCheckedChange={(checked) => {
									if (isSaving) return
									void updateSetting("auto_summary_enabled", checked)
								}}
								data-testid="recording-setting-auto-summary-enabled"
							/>
						</div>

						{/* Row 3: AI Model Selector (using LanguageModelSwitch) */}
						<div className="flex items-center justify-between gap-4 py-4">
							<div className="flex flex-col gap-0.5">
								<span className="text-sm font-medium text-foreground">
									{t("super:mobile.recordingEntry.settings.model.label")}
								</span>
								<span className="text-xs leading-normal text-muted-foreground">
									{t("super:mobile.recordingEntry.settings.model.description")}
								</span>
							</div>
							<div className="flex w-[180px] justify-end">
								<LanguageModelSwitch
									size="small"
									selectedModel={selectedModel}
									modelList={summaryModelGroups}
									onModelChange={(model) =>
										void handleModelSelect(model?.model_id ?? "")
									}
									showName
									showBorder
									placement="bottom"
									className="h-9 w-[180px] justify-between px-3"
								/>
							</div>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
