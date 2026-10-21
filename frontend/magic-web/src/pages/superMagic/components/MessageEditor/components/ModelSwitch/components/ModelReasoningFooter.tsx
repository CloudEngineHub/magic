import { useEffect, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import modelCache from "@/services/superMagic/topicModel/SuperMagicTopicModelCacheService"
import { cn } from "@/utils/cn"
import {
	reasoningEffortLevels,
	type ModelItem,
	type ModelTabType,
	type ReasoningEffort,
} from "../types"
import { getModelDisplayedReasoningEffort } from "../utils"

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
	/** panel：桌面面板底部一行，点击弹出档位菜单；inline：移动端模式选择页，档位直接铺开。 */
	layout?: "panel" | "inline"
}

/**
 * 当前选中语言模型的思考强度入口。这是面板里唯一能改强度的地方：
 * 模型行上的信息卡只读，避免在未选中的模型上改强度时顺带切换模型。
 */
export function ModelReasoningFooter({
	model,
	onReasoningEffortChange,
	layout = "panel",
}: ModelReasoningFooterProps) {
	const { t } = useTranslation("super")
	const [open, setOpen] = useState(false)
	// 本地记住刚选的档位，父组件回传新的 selectedModel 之前文字也立即更新。
	const [override, setOverride] = useState<ReasoningEffort | null | undefined>(undefined)
	const labels: Record<ReasoningEffort, string> = {
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
	const canSelect = levels.length > 0
	const selected =
		override === undefined
			? canSelect
				? getModelDisplayedReasoningEffort(model)
				: undefined
			: (override ?? undefined)
	const selectedLabel = canSelect && selected ? labels[selected] : defaultLabel
	// 首项是显式「默认」，再次点击已选档位不会清除覆盖；桌面与移动端语义一致。
	const options: Array<ReasoningEffort | undefined> = [undefined, ...levels]

	useEffect(() => {
		setOverride(undefined)
		setOpen(false)
	}, [model.model_id, model.reasoning_effort])

	function selectEffort(effort?: ReasoningEffort) {
		modelCache.setReasoningEffort(model, effort)
		setOverride(effort ?? null)
		setOpen(false)
		onReasoningEffortChange({ ...model, reasoning_effort: effort ?? null })
	}

	if (layout === "inline") {
		return (
			<div
				data-testid="model-switch-reasoning-footer"
				className="relative w-full shrink-0 pb-1"
			>
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

	const trigger = (
		<button
			type="button"
			disabled={!canSelect}
			className={cn(
				"flex h-9 w-full min-w-0 items-center justify-between gap-3 rounded-lg px-2 text-left text-sm",
				"outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
				canSelect ? "hover:bg-muted/60" : "cursor-default",
				open && "bg-muted/60",
			)}
			aria-expanded={canSelect ? open : undefined}
			data-testid="model-switch-reasoning-footer-trigger"
		>
			<span className="shrink-0 text-foreground">
				{t("messageEditor.modelSwitch.reasoning.label")}
			</span>
			<span
				className={cn(
					"flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-sm",
					canSelect ? "bg-muted text-foreground" : "text-muted-foreground",
				)}
			>
				{selectedLabel}
				{canSelect ? (
					<ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
				) : null}
			</span>
		</button>
	)

	return (
		<div
			data-testid="model-switch-reasoning-footer"
			className="shrink-0 border-t border-border/70 px-1.5 py-1"
		>
			{canSelect ? (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>{trigger}</PopoverTrigger>
					<PopoverContent
						data-testid="model-switch-reasoning-menu"
						// 菜单挂在 Portal 里；父级 DropdownMenu 据此属性不把它当作外部点击。
						data-model-switch-details-overlay
						side="top"
						align="end"
						sideOffset={6}
						collisionPadding={12}
						// 菜单向上盖在面板上，层级要不低于 DropdownMenu 本身，否则会被面板挡住。
						className="z-dropdown w-40 rounded-lg p-0 duration-100"
					>
						<ScrollArea viewportClassName="max-h-64">
							<div
								className="flex flex-col p-1"
								role="group"
								aria-label={t("messageEditor.modelSwitch.reasoning.label")}
							>
								{options.map((level, index) => (
									<div
										key={level ?? "default"}
										className={index === 0 ? "mb-1 border-b pb-1" : undefined}
									>
										<Button
											type="button"
											variant="ghost"
											className="h-9 w-full justify-between px-2 text-sm font-normal"
											onClick={() => selectEffort(level)}
											aria-pressed={selected === level}
											data-testid={`model-switch-reasoning-option-${level ?? "default"}`}
										>
											{level ? labels[level] : defaultLabel}
											{selected === level ? (
												<Check className="size-4" aria-hidden="true" />
											) : null}
										</Button>
									</div>
								))}
							</div>
						</ScrollArea>
					</PopoverContent>
				</Popover>
			) : (
				// 没有可选档位时仍显示当前模型固定为默认，不打开菜单。
				trigger
			)}
		</div>
	)
}
