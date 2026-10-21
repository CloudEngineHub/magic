import { useTranslation } from "react-i18next"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import modelCache from "@/services/superMagic/topicModel/SuperMagicTopicModelCacheService"
import { cn } from "@/utils/cn"
import { type ModelItem, type ModelTabType, type ReasoningEffort } from "../types"
import { getModelDisplayedReasoningEffort, getSelectableReasoningLevels } from "../utils"
import { ReasoningEffortSelect } from "./ReasoningEffortSelect"

/** 用列表里的当前模型能力，并保留已选模型上的显式强度。 */
export function resolveReasoningFooterModel({
	activeTab,
	selectedModel,
	groups,
}: {
	activeTab: ModelTabType
	selectedModel?: ModelItem | null
	groups: Array<{ models?: ModelItem[] | null }>
}): ModelItem | null {
	if (activeTab !== "language" || !selectedModel) return null
	const current =
		groups
			.flatMap((group) => group.models ?? [])
			.find((model) => model.model_id === selectedModel.model_id) ?? selectedModel
	if (Object.prototype.hasOwnProperty.call(selectedModel, "reasoning_effort")) {
		return { ...current, reasoning_effort: selectedModel.reasoning_effort ?? null }
	}
	return current
}

interface ModelReasoningFooterProps {
	model: ModelItem
	onReasoningEffortChange: (model: ModelItem) => void
	/** panel：桌面面板底部；inline：移动端模式选择页，档位横向铺开。 */
	layout?: "panel" | "inline"
}

/**
 * 当前选中语言模型的思考强度。桌面底栏和模型行的悬停卡用同一个选择器，
 * 这里只负责把它放在面板底部；移动端沿用既有的横向胶囊行。
 */
export function ModelReasoningFooter({
	model,
	onReasoningEffortChange,
	layout = "panel",
}: ModelReasoningFooterProps) {
	if (layout === "inline") {
		return (
			<InlineReasoningFooter
				model={model}
				onReasoningEffortChange={onReasoningEffortChange}
			/>
		)
	}

	return (
		<div
			data-testid="model-switch-reasoning-footer"
			className="shrink-0 border-t border-border/70 px-1.5 py-1"
		>
			<ReasoningEffortSelect
				model={model}
				onReasoningEffortChange={onReasoningEffortChange}
				side="top"
				align="end"
			/>
		</div>
	)
}

/** 移动端模式选择页里的档位行：横向滚动的圆角胶囊，样式沿用移动端既有设计。 */
function InlineReasoningFooter({
	model,
	onReasoningEffortChange,
}: {
	model: ModelItem
	onReasoningEffortChange: (model: ModelItem) => void
}) {
	const { t } = useTranslation("super")
	const defaultLabel = t("messageEditor.modelSwitch.reasoning.default")
	const labels: Record<ReasoningEffort, string> = {
		none: t("messageEditor.modelSwitch.reasoning.none"),
		minimal: t("messageEditor.modelSwitch.reasoning.minimal"),
		low: t("messageEditor.modelSwitch.reasoning.low"),
		medium: t("messageEditor.modelSwitch.reasoning.medium"),
		high: t("messageEditor.modelSwitch.reasoning.high"),
		xhigh: t("messageEditor.modelSwitch.reasoning.xhigh"),
		max: t("messageEditor.modelSwitch.reasoning.max"),
	}
	const levels = getSelectableReasoningLevels(model)
	const canSelect = levels.length > 0
	const selected = canSelect ? getModelDisplayedReasoningEffort(model) : undefined
	const options: Array<ReasoningEffort | undefined> = [undefined, ...levels]

	function selectEffort(effort?: ReasoningEffort) {
		modelCache.setReasoningEffort(model, effort)
		onReasoningEffortChange({ ...model, reasoning_effort: effort ?? null })
	}

	return (
		<div data-testid="model-switch-reasoning-footer" className="relative w-full shrink-0 pb-1">
			<div className="flex h-8 items-center">
				<span className="w-7 shrink-0" aria-hidden="true" />
				<span className="text-sm text-muted-foreground">
					{t("messageEditor.modelSwitch.reasoning.label")}
				</span>
				{canSelect ? null : (
					<span className="ml-auto text-sm text-foreground" aria-disabled="true">
						{defaultLabel}
					</span>
				)}
			</div>
			{canSelect ? (
				<ScrollArea
					scrollbarOrientation="horizontal"
					hideScrollbar
					className="h-8 w-full [&_[data-slot=scroll-area-scrollbar]]:h-0 [&_[data-slot=scroll-area-scrollbar]]:border-0 [&_[data-slot=scroll-area-scrollbar]]:p-0"
					viewportClassName="h-8 w-full [&>div]:!block"
				>
					<div
						className="flex w-max gap-1.5 pl-7"
						role="group"
						aria-label={t("messageEditor.modelSwitch.reasoning.label")}
					>
						{options.map((level) => {
							const pressed = selected === level
							return (
								<button
									key={level ?? "default"}
									type="button"
									aria-pressed={pressed}
									data-testid={`model-switch-reasoning-option-${level ?? "default"}`}
									className={cn(
										"h-8 shrink-0 rounded-full px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
										pressed
											? "bg-foreground font-medium text-background"
											: "bg-background text-foreground active:opacity-80",
									)}
									onClick={() => selectEffort(level)}
								>
									{level ? labels[level] : defaultLabel}
								</button>
							)
						})}
					</div>
				</ScrollArea>
			) : null}
		</div>
	)
}
