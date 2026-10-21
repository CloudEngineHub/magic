import { useState, type ReactElement } from "react"
import { useTranslation } from "react-i18next"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/shadcn-ui/hover-card"
import type { ModelItem } from "../types"
import { hasBillingMultiplier, ModelBillingMultiplier } from "./ModelBillingMultiplier"
import { getSelectableReasoningLevels } from "../utils"
import { ReasoningEffortSelect } from "./ReasoningEffortSelect"

/** 卡片贴在面板右侧外缘，留出面板内边距与阴影的距离。 */
const MODEL_INFO_HOVER_SIDE_OFFSET = 14
/**
 * 信息卡里有可点的强度档位，属于带操作的悬浮面板而不是普通文字提示，
 * 因此不用 Tooltip 规范的 700ms，而是在鼠标停稳后尽快出现；关闭保留一小段过渡，方便从行移到卡片上。
 */
export const MODEL_INFO_HOVER_OPEN_DELAY_MS = 150
const MODEL_INFO_HOVER_CLOSE_DELAY_MS = 200

export function formatContextWindow(value?: number | null) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`
	if (value >= 1_000) return `${Math.round(value / 1_000)}K`
	return String(value)
}

interface ModelInfoHoverCardProps {
	model: ModelItem
	description?: string
	/**
	 * 在卡片里选择档位时回调带 reasoning_effort 的模型快照。调用方把它当作选中该模型，
	 * 所以在未选中模型的卡片里改强度等于「换成这个模型并用这个强度」。不传则卡片只读。
	 */
	onReasoningEffortChange?: (model: ModelItem) => void
	/** 模型行本身，作为悬停触发器；点击、键盘选中仍由行自己处理。 */
	children: ReactElement
}

/**
 * 桌面模型行的悬停信息卡：名称、描述、上下文窗口、消耗倍率，以及该模型的思考强度档位。
 * 思考强度用与底栏相同的选择器；它的菜单打开期间卡片保持不关闭。
 */
export function ModelInfoHoverCard({
	model,
	description = model.model_description,
	onReasoningEffortChange,
	children,
}: ModelInfoHoverCardProps) {
	const { t } = useTranslation("super")
	const contextWindow = formatContextWindow(model.max_context_tokens)
	const showMultiplier = hasBillingMultiplier(model.billing_multiplier)
	const canSelectEffort =
		getSelectableReasoningLevels(model).length > 0 && !!onReasoningEffortChange
	// 卡片受控：鼠标离开卡片会请求关闭，但强度菜单（挂在 Portal 里）打开期间要忽略这次关闭。
	const [open, setOpen] = useState(false)
	const [effortMenuOpen, setEffortMenuOpen] = useState(false)

	// 没有任何可补充的信息时不挂卡片，避免悬停弹出一张只有名称的空卡。
	if (!description && !contextWindow && !showMultiplier && !canSelectEffort) return children

	return (
		<HoverCard
			open={open || effortMenuOpen}
			onOpenChange={setOpen}
			openDelay={MODEL_INFO_HOVER_OPEN_DELAY_MS}
			closeDelay={MODEL_INFO_HOVER_CLOSE_DELAY_MS}
		>
			<HoverCardTrigger asChild>{children}</HoverCardTrigger>
			<HoverCardContent
				// 父级 DropdownMenu 据此属性把卡片上的点击视为面板内部交互，不关闭模型列表。
				data-model-switch-details-overlay
				data-testid="model-info-hover-card"
				side="right"
				align="start"
				sideOffset={MODEL_INFO_HOVER_SIDE_OFFSET}
				collisionPadding={12}
				// 层级不低于 DropdownMenu 本身，碰撞翻转到面板上方时不会被面板挡住。
				className="z-dropdown w-60 max-w-[calc(100vw-24px)] rounded-xl border-border/80 bg-card p-0 text-xs shadow-[0_12px_32px_rgba(15,23,42,0.14)] duration-100"
			>
				<div className="px-3.5 pb-3 pt-3.5">
					<div className="break-words text-sm font-medium leading-5 text-foreground">
						{model.model_name || model.model_id}
					</div>
					{description ? (
						<p className="mt-1 break-words leading-5 text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
				{contextWindow || showMultiplier ? (
					<dl className="flex flex-col gap-2 border-t border-border/70 px-3.5 py-3">
						{contextWindow ? (
							<div className="flex items-center justify-between gap-3">
								<dt className="text-muted-foreground">
									{t("messageEditor.modelSwitch.contextWindow")}
								</dt>
								<dd className="tabular-nums text-foreground">{contextWindow}</dd>
							</div>
						) : null}
						{showMultiplier ? (
							<div className="flex flex-col gap-0.5">
								<div className="flex items-center justify-between gap-3">
									<dt className="text-muted-foreground">
										{t("messageEditor.modelSwitch.billingMultiplier")}
									</dt>
									<dd>
										<ModelBillingMultiplier
											value={model.billing_multiplier}
											className="text-xs text-foreground"
										/>
									</dd>
								</div>
								<p className="leading-4 text-muted-foreground/80">
									{t("messageEditor.modelSwitch.billingMultiplierHint")}
								</p>
							</div>
						) : null}
					</dl>
				) : null}
				{canSelectEffort && onReasoningEffortChange ? (
					<div className="border-t border-border/70 px-2 py-1.5">
						<ReasoningEffortSelect
							model={model}
							onReasoningEffortChange={onReasoningEffortChange}
							side="bottom"
							align="end"
							onOpenChange={(menuOpen) => {
								setEffortMenuOpen(menuOpen)
								// 菜单收起（选完或点到外面）后，鼠标多半已不在卡片上，直接收起卡片。
								if (!menuOpen) setOpen(false)
							}}
						/>
					</div>
				) : null}
			</HoverCardContent>
		</HoverCard>
	)
}
