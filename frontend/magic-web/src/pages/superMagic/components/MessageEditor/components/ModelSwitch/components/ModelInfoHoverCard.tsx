import type { ReactElement } from "react"
import { useTranslation } from "react-i18next"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/shadcn-ui/hover-card"
import type { ModelItem } from "../types"
import { hasBillingMultiplier, ModelBillingMultiplier } from "./ModelBillingMultiplier"

/** 卡片贴在 380px 面板右侧外缘，留出面板内边距与阴影的距离。 */
const MODEL_INFO_HOVER_SIDE_OFFSET = 14

export function formatContextWindow(value?: number | null) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`
	if (value >= 1_000) return `${Math.round(value / 1_000)}K`
	return String(value)
}

interface ModelInfoHoverCardProps {
	model: ModelItem
	description?: string
	/** 模型行本身，作为悬停触发器；点击、键盘选中仍由行自己处理。 */
	children: ReactElement
}

/**
 * 桌面模型行的只读信息卡：名称、描述、上下文窗口、消耗倍率。
 * 卡片内没有任何可操作元素，思考强度只能从面板底部的入口修改，
 * 因此不需要互斥控制器或自定义计时，直接沿用 HoverCard 的默认开关延迟。
 */
export function ModelInfoHoverCard({
	model,
	description = model.model_description,
	children,
}: ModelInfoHoverCardProps) {
	const { t } = useTranslation("super")
	const contextWindow = formatContextWindow(model.max_context_tokens)
	const showMultiplier = hasBillingMultiplier(model.billing_multiplier)

	// 没有任何可补充的信息时不挂卡片，避免悬停弹出一张只有名称的空卡。
	if (!description && !contextWindow && !showMultiplier) return children

	return (
		<HoverCard>
			<HoverCardTrigger asChild>{children}</HoverCardTrigger>
			<HoverCardContent
				// 父级 DropdownMenu 据此属性把卡片上的点击视为面板内部交互，不关闭模型列表。
				data-model-switch-details-overlay
				data-testid="model-info-hover-card"
				side="right"
				align="start"
				sideOffset={MODEL_INFO_HOVER_SIDE_OFFSET}
				collisionPadding={12}
				className="z-dropdown w-64 max-w-[calc(100vw-24px)] rounded-xl border-border/80 bg-card p-0 text-sm shadow-[0_12px_32px_rgba(15,23,42,0.14)] duration-100"
			>
				<div className="px-4 pb-3.5 pt-4">
					<div className="break-words text-base font-medium leading-6 text-foreground">
						{model.model_name || model.model_id}
					</div>
					{description ? (
						<p className="mt-1.5 break-words text-sm leading-5 text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
				{contextWindow || showMultiplier ? (
					<dl className="flex flex-col gap-2.5 border-t border-border/70 px-4 py-3.5">
						{contextWindow ? (
							<div className="flex items-center justify-between gap-3">
								<dt className="text-muted-foreground">
									{t("messageEditor.modelSwitch.contextWindow")}
								</dt>
								<dd className="tabular-nums text-foreground">{contextWindow}</dd>
							</div>
						) : null}
						{showMultiplier ? (
							<div className="flex flex-col gap-1">
								<div className="flex items-center justify-between gap-3">
									<dt className="text-muted-foreground">
										{t("messageEditor.modelSwitch.billingMultiplier")}
									</dt>
									<dd>
										<ModelBillingMultiplier
											value={model.billing_multiplier}
											className="text-sm text-foreground"
										/>
									</dd>
								</div>
								<p className="text-[11px] leading-4 text-muted-foreground">
									{t("messageEditor.modelSwitch.billingMultiplierHint")}
								</p>
							</div>
						) : null}
					</dl>
				) : null}
			</HoverCardContent>
		</HoverCard>
	)
}
