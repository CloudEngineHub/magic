import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/shadcn-ui/input"
import { MagicSelect } from "@/components/base"
import { MagicSwitch } from "@/components/base/MagicSwitch"
import { ScheduledItem } from "@/components/business/AccountSetting/pages/ScheduledTasks/components/ScheduledItem"
import type { ScheduledTask } from "@/types/scheduledTask"
import ModelIcon from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/components/ModelIcon"
import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"
import { CARD_TEMPLATES } from "../hooks/useAICardConfig"
import type { CardTemplateType } from "../hooks/useAICardConfig"

export interface AICardFormFieldsValues {
	taskName: string
	prompt: string
	template: CardTemplateType
	timeConfig?: ScheduledTask.TimeConfig | null
	enabled?: boolean
	model?: ModelItem | null
	imageModel?: ModelItem | null
	videoModel?: ModelItem | null
}

interface AICardFormFieldsProps {
	values: AICardFormFieldsValues
	onChange: (updates: Partial<AICardFormFieldsValues>) => void
	disabled?: boolean
	/** Model lists — when provided, the model selects section renders */
	modelList?: ModelItem[]
	imageModelList?: ModelItem[]
	videoModelList?: ModelItem[]
	/** Whether to show schedule/model/enabled as expanded by default */
	advancedExpanded?: boolean
}

function AICardFormFields({
	values,
	onChange,
	disabled,
	modelList,
	imageModelList,
	videoModelList,
	advancedExpanded = false,
}: AICardFormFieldsProps) {
	const { t } = useTranslation("super")
	const [expanded, setExpanded] = useState(advancedExpanded)

	const handleTimeConfigChange = useCallback(
		(config: ScheduledTask.TimeConfig) => {
			onChange({ timeConfig: config })
		},
		[onChange],
	)

	const handleModelChange = useCallback(
		(modelId: string) => {
			const model = modelList?.find((m) => m.model_id === modelId) || null
			onChange({ model })
		},
		[modelList, onChange],
	)

	const handleImageModelChange = useCallback(
		(modelId: string) => {
			const model = imageModelList?.find((m) => m.model_id === modelId) || null
			onChange({ imageModel: model })
		},
		[imageModelList, onChange],
	)

	const handleVideoModelChange = useCallback(
		(modelId: string) => {
			const model = videoModelList?.find((m) => m.model_id === modelId) || null
			onChange({ videoModel: model })
		},
		[videoModelList, onChange],
	)

	const renderModelOption = useCallback(
		(models: ModelItem[]) => (option: { label: React.ReactNode; value: string | number }) => {
			const model = models.find((m) => m.model_id === String(option.value))
			if (!model) return option.label
			return (
				<span className="flex items-center gap-2">
					<ModelIcon model={model} size={16} className="shrink-0 rounded-sm" />
					<span className="truncate">{model.model_name}</span>
				</span>
			)
		},
		[],
	)

	const renderModelLabel = useCallback(
		(models: ModelItem[]) => (option: { label: React.ReactNode; value: string | number }) => {
			const model = models.find((m) => m.model_id === String(option.value))
			if (!model) return option.label
			return (
				<span className="flex items-center gap-2">
					<ModelIcon model={model} size={14} className="shrink-0 rounded-sm" />
					<span className="truncate">{model.model_name}</span>
				</span>
			)
		},
		[],
	)

	const hasAdvanced = modelList || imageModelList || videoModelList

	return (
		<>
			{/* Card Name */}
			<div className="space-y-2">
				<label className="text-sm font-medium text-foreground">
					{t("detail.aiCard.form.cardName")} <span className="text-destructive">*</span>
				</label>
				<Input
					value={values.taskName}
					onChange={(e) => onChange({ taskName: e.target.value })}
					placeholder={t("detail.aiCard.form.cardNamePlaceholder")}
					disabled={disabled}
					className="h-10"
				/>
			</div>

			{/* Template */}
			<div className="space-y-2">
				<label className="text-sm font-medium text-foreground">
					{t("detail.aiCard.form.template")}
				</label>
				<MagicSelect
					value={values.template}
					onChange={(val: CardTemplateType) => onChange({ template: val })}
					className="w-full"
					disabled={disabled}
					options={CARD_TEMPLATES.map((opt) => ({
						label: t(opt.labelKey),
						value: opt.value,
					}))}
				/>
				<p className="text-xs text-muted-foreground">
					{t("detail.aiCard.form.templateHint")}
				</p>
			</div>

			{/* Prompt */}
			<div className="space-y-2">
				<label className="text-sm font-medium text-foreground">
					{t("detail.aiCard.form.prompt")} <span className="text-destructive">*</span>
				</label>
				<textarea
					value={values.prompt}
					onChange={(e) => onChange({ prompt: e.target.value })}
					placeholder={t("detail.aiCard.form.promptPlaceholder")}
					disabled={disabled}
					rows={4}
					className={cn(
						"flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
						"ring-offset-background placeholder:text-muted-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						"disabled:cursor-not-allowed disabled:opacity-50",
						"resize-y",
					)}
				/>
				<p className="text-xs text-muted-foreground">
					{t("detail.aiCard.form.promptHint")}
				</p>
			</div>

			{/* Advanced Section — collapsible */}
			{hasAdvanced && (
				<div className="space-y-4 overflow-hidden rounded-lg border border-border">
					{/* Toggle header */}
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg transition-colors"
					>
						<span>{t("detail.aiCard.form.advancedSettings")}</span>
						<ChevronDown
							size={16}
							className={cn(
								"text-muted-foreground transition-transform duration-200",
								expanded && "rotate-180",
							)}
						/>
					</button>

					{expanded && (
						<div className="space-y-4 px-4 pb-4">
							{/* Schedule */}
							<div className="space-y-2">
								<label className="text-sm font-medium text-foreground">
									{t("detail.aiCard.config.schedule")}
								</label>
								<ScheduledItem
									value={values.timeConfig || undefined}
									onChange={handleTimeConfigChange}
									disabled={disabled}
								/>
							</div>

							{/* Model selections — 3 column grid */}
							{modelList && modelList.length > 0 && (
								<div className="space-y-3">
									<div className="text-sm font-medium text-foreground">
										{t("detail.aiCard.config.modelSection")}
									</div>
									<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
										{/* Language model */}
										<div className="min-w-0 space-y-1.5">
											<label className="text-xs text-muted-foreground">
												{t("detail.aiCard.config.languageModel")}
											</label>
											<MagicSelect
												value={values.model?.model_id || undefined}
												onChange={handleModelChange}
												placeholder={t("detail.aiCard.config.defaultModel")}
												className="w-full"
												disabled={disabled}
												options={modelList.map((m) => ({
													label: m.model_name,
													value: m.model_id,
												}))}
												optionRender={renderModelOption(modelList)}
												labelRender={renderModelLabel(modelList)}
												popupClassName="max-h-[280px] overflow-y-auto"
											/>
										</div>

										{/* Image model */}
										{imageModelList && imageModelList.length > 0 && (
											<div className="min-w-0 space-y-1.5">
												<label className="text-xs text-muted-foreground">
													{t("detail.aiCard.config.imageModel")}
												</label>
												<MagicSelect
													value={values.imageModel?.model_id || undefined}
													onChange={handleImageModelChange}
													placeholder={t(
														"detail.aiCard.config.defaultImageModel",
													)}
													className="w-full"
													disabled={disabled}
													options={imageModelList.map((m) => ({
														label: m.model_name,
														value: m.model_id,
													}))}
													optionRender={renderModelOption(imageModelList)}
													labelRender={renderModelLabel(imageModelList)}
													popupClassName="max-h-[280px] overflow-y-auto"
												/>
											</div>
										)}

										{/* Video model */}
										{videoModelList && videoModelList.length > 0 && (
											<div className="min-w-0 space-y-1.5">
												<label className="text-xs text-muted-foreground">
													{t("detail.aiCard.config.videoModel")}
												</label>
												<MagicSelect
													value={values.videoModel?.model_id || undefined}
													onChange={handleVideoModelChange}
													placeholder={t(
														"detail.aiCard.config.defaultVideoModel",
													)}
													className="w-full"
													disabled={disabled}
													options={videoModelList.map((m) => ({
														label: m.model_name,
														value: m.model_id,
													}))}
													optionRender={renderModelOption(videoModelList)}
													labelRender={renderModelLabel(videoModelList)}
													popupClassName="max-h-[280px] overflow-y-auto"
												/>
											</div>
										)}
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			)}

			{/* Enabled toggle — outside collapsible section */}
			{hasAdvanced && (
				<div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
					<div>
						<div className="text-sm font-medium text-foreground">
							{t("detail.aiCard.config.enableSchedule")}
						</div>
						<div className="text-xs text-muted-foreground">
							{t("detail.aiCard.config.enableScheduleHint")}
						</div>
					</div>
					<MagicSwitch
						checked={values.enabled ?? true}
						onChange={(checked) => onChange({ enabled: checked })}
						disabled={disabled}
					/>
				</div>
			)}
		</>
	)
}

export default AICardFormFields
