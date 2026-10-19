import { useId, useState, type RefObject } from "react"
import { Check, ChevronRight, ChevronUp } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { getModelDisplayedReasoningEffort, getNextModelReasoningEffort } from "../utils"
import modelCache from "@/services/superMagic/topicModel/SuperMagicTopicModelCacheService"
import { cn } from "@/utils/cn"
import { reasoningEffortLevels, type ModelItem, type ReasoningEffort } from "../types"
import { CollapsibleDescription } from "./CollapsibleDescription"
import { ModelBillingMultiplier } from "./ModelBillingMultiplier"
import ModelIcon from "./ModelIcon"

interface MobileModelRowProps {
	model: ModelItem
	description?: string
	selected: boolean
	variant?: "mobile" | "desktop"
	disabled: boolean
	expanded: boolean
	selectedItemRef: RefObject<HTMLDivElement>
	onToggle: () => void
	onSelect: (model: ModelItem) => void
	onReasoningEffortChange?: (model: ModelItem) => void
}

/** Inline model details row: selecting a model remains separate from changing its reasoning effort. */
export function MobileModelRow({
	model,
	description,
	selected,
	variant = "mobile",
	disabled,
	expanded,
	selectedItemRef,
	onToggle,
	onSelect,
	onReasoningEffortChange,
}: MobileModelRowProps) {
	const { t } = useTranslation("super")
	const detailsId = useId()
	const [descriptionExpanded, setDescriptionExpanded] = useState(false)
	const effort = getModelDisplayedReasoningEffort(model)
	const labels = {
		none: t("messageEditor.modelSwitch.reasoning.none"),
		minimal: t("messageEditor.modelSwitch.reasoning.minimal"),
		low: t("messageEditor.modelSwitch.reasoning.low"),
		medium: t("messageEditor.modelSwitch.reasoning.medium"),
		high: t("messageEditor.modelSwitch.reasoning.high"),
		xhigh: t("messageEditor.modelSwitch.reasoning.xhigh"),
		max: t("messageEditor.modelSwitch.reasoning.max"),
	}
	const defaultLabel = t("messageEditor.modelSwitch.reasoning.default")
	const levels = reasoningEffortLevels.filter((level) =>
		model.reasoning_effort_levels?.includes(level),
	)
	const hasMultiplier =
		typeof model.billing_multiplier === "number" &&
		Number.isFinite(model.billing_multiplier) &&
		model.billing_multiplier >= 0
	const hasDetails = hasMultiplier || !!description || levels.length > 0
	const name = model.model_name || model.model_id
	const isDesktop = variant === "desktop"
	const DetailsIcon = expanded ? ChevronUp : ChevronRight

	/** 再次点击清除个人覆盖；继承档位只用于展示，不写入发送快照。 */
	function selectEffort(level: ReasoningEffort) {
		if (disabled) return
		const value = getNextModelReasoningEffort(model, level)
		modelCache.setReasoningEffort(model, value)
		const handleChange = onReasoningEffortChange ?? onSelect
		handleChange({ ...model, reasoning_effort: value ?? null })
	}

	return (
		<div
			ref={selected ? selectedItemRef : null}
			className={cn(
				"min-w-0 transition-colors",
				isDesktop ? "rounded-xl border border-transparent" : "rounded-3xl",
				(expanded || selected) && "bg-card",
				isDesktop && expanded && "shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)]",
				disabled && "opacity-50",
			)}
			data-testid={isDesktop ? "model-switch-inline-row" : "mobile-model-row"}
		>
			<div className={cn("flex min-h-14 items-center", isDesktop && "px-3")}>
				<button
					type="button"
					disabled={disabled}
					onClick={() => {
						if (isDesktop && selected) onToggle()
						else onSelect(model)
					}}
					aria-label={name}
					aria-pressed={selected}
					className={cn(
						"flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
						isDesktop ? "rounded-xl" : "rounded-3xl pl-2",
					)}
					data-testid="model-switch-item"
					data-model-id={model.model_id}
					data-model-name={model.model_name}
					data-selected={selected}
				>
					<span className="flex size-7 shrink-0 items-center justify-center">
						<ModelIcon model={model} size={28} className="size-7 object-contain" />
					</span>
					<span className="min-w-0 flex-1">
						<span className="block truncate text-base font-medium text-foreground">
							{name}
						</span>
						{levels.length > 0 && (
							<span className="block text-xs leading-5 text-muted-foreground">
								{t("messageEditor.modelSwitch.reasoning.summary", {
									level: effort ? labels[effort] : defaultLabel,
								})}
							</span>
						)}
					</span>
				</button>
				<div className="flex shrink-0 items-center gap-2 pl-2 pr-1">
					<ModelBillingMultiplier value={model.billing_multiplier} />
					{selected && <Check className="size-4 text-primary" aria-hidden="true" />}
					{hasDetails && (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-11 rounded-full"
							disabled={disabled}
							aria-label={t("messageEditor.modelSwitch.reasoning.detailsFor", {
								name,
							})}
							aria-expanded={expanded}
							aria-controls={detailsId}
							onClick={() => {
								setDescriptionExpanded(false)
								onToggle()
							}}
						>
							<DetailsIcon className="size-4" aria-hidden="true" />
						</Button>
					)}
				</div>
			</div>
			{expanded && hasDetails && (
				// 与行头的 8px 内边距、28px 图标及 12px 间隔共用 48px 左边界。
				<div
					id={detailsId}
					className="space-y-3 pb-4 pl-12 pr-3"
					data-testid="mobile-model-details"
				>
					{hasMultiplier && (
						<p className="text-xs leading-5 text-muted-foreground">
							{t("messageEditor.modelSwitch.billingMultiplierHint")}
						</p>
					)}
					<CollapsibleDescription
						description={description}
						isExpanded={descriptionExpanded}
						variant="mobile"
						expandLabel={t("messageEditor.modelSwitch.expandDescriptionShort")}
						collapseLabel={t("messageEditor.modelSwitch.collapseDescriptionShort")}
						onToggle={() => setDescriptionExpanded((value) => !value)}
					/>
					{levels.length > 0 && (
						<fieldset className="min-w-0">
							<legend className="mb-2 text-sm text-muted-foreground">
								{t("messageEditor.modelSwitch.reasoning.mobileLabel")}
							</legend>
							<div className="grid grid-cols-4 gap-2">
								{levels.map((value) => (
									<Button
										key={value}
										type="button"
										variant="ghost"
										disabled={disabled}
										aria-pressed={effort === value}
										className={cn(
											"h-11 min-w-0 gap-1 rounded-full bg-muted px-1 text-sm font-normal",
											effort === value &&
												"bg-primary/10 text-primary hover:bg-primary/15",
										)}
										onClick={() => selectEffort(value)}
									>
										{effort === value && (
											<Check className="size-4" aria-hidden="true" />
										)}
										<span className="min-w-0 truncate">{labels[value]}</span>
									</Button>
								))}
							</div>
						</fieldset>
					)}
				</div>
			)}
		</div>
	)
}
