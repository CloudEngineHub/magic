import { useRef, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import MagicPopup from "@/components/base-mobile/MagicPopup"
import { ScrollEdgeFadeContainer } from "@/components/base-mobile/ScrollEdgeFade"
import { Spinner } from "@/components/shadcn-ui/spinner"
import { Switch } from "@/components/shadcn-ui/switch"
import { ModelListContent } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/components/ModelListContent"
import ModelIcon from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/components/ModelIcon"
import type { ModelListGroup } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"
import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/types"
import { useMobileRecordingSettings } from "../hooks/useMobileRecordingSettings"
import type { RecordingSettings } from "../types/recording-settings"

type SettingsSheetView = "menu" | "model"

const MOBILE_RECORDING_SETTINGS_SWITCH_CLASSNAME =
	"pointer-events-none mt-0.5 h-[28px] w-[48px] shrink-0 [&_[data-slot=switch-thumb]]:size-6"

interface MobileRecordingSettingsSheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

/** Toggle row for transcription/summary switches; whole row toggles the switch */
function SettingsSwitchRow(props: {
	label: string
	description?: string
	checked: boolean
	onCheckedChange: (next: boolean) => void
	showDivider?: boolean
	dataTestId: string
}) {
	const { label, description, checked, onCheckedChange, showDivider = false, dataTestId } = props

	return (
		<>
			<button
				type="button"
				onClick={() => onCheckedChange(!checked)}
				className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-opacity active:opacity-60"
				data-testid={dataTestId}
				aria-pressed={checked}
			>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="text-base leading-5 text-foreground">{label}</span>
					{description ? (
						<span className="text-xs leading-snug text-muted-foreground">
							{description}
						</span>
					) : null}
				</div>
				<Switch
					checked={checked}
					onCheckedChange={onCheckedChange}
					className={MOBILE_RECORDING_SETTINGS_SWITCH_CLASSNAME}
					tabIndex={-1}
					aria-hidden
				/>
			</button>
			{showDivider ? (
				<div className="px-3.5">
					<div className="h-px w-full bg-border" />
				</div>
			) : null}
		</>
	)
}

/** Navigates to model subview and shows current model summary */
function ModelPickerRow(props: {
	label: string
	description?: string
	model: ModelItem | null
	onClick: () => void
}) {
	const { label, description, model, onClick } = props

	return (
		<button
			type="button"
			onClick={onClick}
			className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-opacity active:opacity-60"
			data-testid="recording-setting-model-picker"
		>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="text-base leading-5 text-foreground">{label}</span>
				{description ? (
					<span className="text-xs leading-snug text-muted-foreground">
						{description}
					</span>
				) : null}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{model ? (
					<>
						<ModelIcon model={model} size={16} />
						<span className="max-w-[120px] truncate text-sm text-muted-foreground">
							{model.model_name}
						</span>
					</>
				) : null}
				<ChevronRight className="size-5 shrink-0 text-muted-foreground" />
			</div>
		</button>
	)
}

/** Renders main menu with transcription/summary sections */
function SettingsMenuView(props: {
	settings: RecordingSettings
	selectedModel: ModelItem | null
	isSaving: boolean
	onOpenModelView: () => void
	onUpdateSetting: ReturnType<typeof useMobileRecordingSettings>["updateSetting"]
}) {
	const { t } = useTranslation("super")
	const { settings, selectedModel, isSaving, onOpenModelView, onUpdateSetting } = props

	return (
		<ScrollEdgeFadeContainer
			fadeColor="muted"
			className="min-h-0 flex-1"
			scrollClassName="no-scrollbar flex flex-col gap-2.5 px-[10px] pb-5 pt-2"
			contentDeps={[
				settings.transcription_enabled,
				settings.auto_summary_enabled,
				settings.model_id,
			]}
		>
			<div
				className="flex flex-col gap-2"
				data-testid="recording-settings-transcription-section"
			>
				<p className="px-[14px] text-[14px] leading-5 text-muted-foreground">
					{t("mobile.recordingEntry.settings.sections.transcription")}
				</p>
				<div className="w-full overflow-hidden rounded-lg bg-card">
					<SettingsSwitchRow
						label={t("mobile.recordingEntry.settings.transcriptionEnabled.label")}
						description={t(
							"mobile.recordingEntry.settings.transcriptionEnabled.description",
						)}
						checked={settings.transcription_enabled}
						onCheckedChange={(next) => {
							if (isSaving) return
							void onUpdateSetting("transcription_enabled", next)
						}}
						dataTestId="recording-setting-transcription-enabled"
					/>
				</div>
			</div>

			<div className="flex flex-col gap-2" data-testid="recording-settings-summary-section">
				<p className="px-[14px] text-[14px] leading-5 text-muted-foreground">
					{t("mobile.recordingEntry.settings.sections.summary")}
				</p>
				<div className="w-full overflow-hidden rounded-lg bg-card">
					<SettingsSwitchRow
						label={t("mobile.recordingEntry.settings.autoSummaryEnabled.label")}
						description={t(
							"mobile.recordingEntry.settings.autoSummaryEnabled.description",
						)}
						checked={settings.auto_summary_enabled}
						onCheckedChange={(next) => {
							if (isSaving) return
							void onUpdateSetting("auto_summary_enabled", next)
						}}
						showDivider
						dataTestId="recording-setting-auto-summary-enabled"
					/>
					<ModelPickerRow
						label={t("mobile.recordingEntry.settings.model.label")}
						description={t("mobile.recordingEntry.settings.model.description")}
						model={selectedModel}
						onClick={onOpenModelView}
					/>
				</div>
			</div>
		</ScrollEdgeFadeContainer>
	)
}

/** Renders provider-grouped model list aligned with mobile composer model picker */
function SettingsModelView(props: {
	summaryModelGroups: ModelListGroup[]
	selectedModel: ModelItem | null
	isSaving: boolean
	onSelectModel: (modelId: string) => void
}) {
	const { summaryModelGroups, selectedModel, isSaving, onSelectModel } = props
	const selectedItemRef = useRef<HTMLDivElement>(null)

	function handleModelClick(model: ModelItem) {
		if (isSaving || model.model_id === selectedModel?.model_id) return
		onSelectModel(model.model_id)
	}

	return (
		<ScrollEdgeFadeContainer
			fadeColor="muted"
			className="min-h-0 flex-1"
			scrollClassName="scrollbar-y-thin flex flex-col gap-5 overflow-y-auto px-6 py-3"
			contentDeps={[selectedModel?.model_id, summaryModelGroups.length]}
		>
			<ModelListContent
				modelList={summaryModelGroups}
				selectedModel={selectedModel}
				searchKeyword=""
				size="mobile"
				onModelClick={handleModelClick}
				selectedItemRef={selectedItemRef}
				getModelDescription={(model) => model.model_description}
				modelKey="models"
			/>
		</ScrollEdgeFadeContainer>
	)
}

/**
 * Bottom sheet for mobile recording preferences: auto transcription, auto summary, and AI model.
 * Persists to topic-model/default_audio.
 */
export function MobileRecordingSettingsSheet({
	open,
	onOpenChange,
}: MobileRecordingSettingsSheetProps) {
	const { t } = useTranslation("super")
	const [view, setView] = useState<SettingsSheetView>("menu")
	const { settings, summaryModelGroups, selectedModel, isLoading, isSaving, updateSetting } =
		useMobileRecordingSettings({ enabled: open })

	function handleClose() {
		onOpenChange(false)
		setView("menu")
	}

	function handleBack() {
		setView("menu")
	}

	async function handleSelectModel(modelId: string) {
		await updateSetting("model_id", modelId)
		setView("menu")
	}

	const sheetTitle =
		view === "menu"
			? t("mobile.recordingEntry.settings.title")
			: t("mobile.recordingEntry.settings.model.title")

	return (
		<MagicPopup
			visible={open}
			onOpenChange={onOpenChange}
			onClose={handleClose}
			position="bottom"
			title={sheetTitle}
			headerVariant="actionHeader"
			headerTitle={sheetTitle}
			headerLeadingAction={{
				icon: view === "menu" ? <X /> : <ChevronLeft />,
				ariaLabel:
					view === "menu"
						? t("mobile.recordingEntry.settings.closeAria")
						: t("mobile.recordingEntry.settings.backAria"),
				onClick: view === "menu" ? handleClose : handleBack,
				testId:
					view === "menu"
						? "mobile-recording-settings-sheet-close"
						: "mobile-recording-settings-sheet-back",
			}}
			className="max-h-[78vh] gap-0 rounded-t-[14px] border-0 bg-muted p-0"
			bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
			style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
			data-testid="mobile-recording-settings-sheet"
		>
			{isLoading || !settings ? (
				<div
					className="flex min-h-[200px] items-center justify-center px-4"
					data-testid="mobile-recording-settings-loading"
					aria-busy="true"
				>
					<Spinner className="size-6 text-muted-foreground" />
				</div>
			) : view === "menu" ? (
				<SettingsMenuView
					settings={settings}
					selectedModel={selectedModel}
					isSaving={isSaving}
					onOpenModelView={() => setView("model")}
					onUpdateSetting={updateSetting}
				/>
			) : (
				<SettingsModelView
					summaryModelGroups={summaryModelGroups}
					selectedModel={selectedModel}
					isSaving={isSaving}
					onSelectModel={handleSelectModel}
				/>
			)}
		</MagicPopup>
	)
}
