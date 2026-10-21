import { useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import modelCache from "@/services/superMagic/topicModel/SuperMagicTopicModelCacheService"
import { cn } from "@/utils/cn"
import { type ModelItem, type ReasoningEffort } from "../types"
import { getModelDisplayedReasoningEffort, getSelectableReasoningLevels } from "../utils"

interface ReasoningEffortSelectProps {
	model: ModelItem
	/** 选中档位后回调带 reasoning_effort 的模型快照；「默认」回传 null 表示跟随后台。 */
	onReasoningEffortChange: (model: ModelItem) => void
	/** 菜单弹出方向：面板底栏向上，悬停卡向下。 */
	side?: "top" | "bottom"
	align?: "start" | "end"
	/** 菜单开合通知，悬停卡用它在菜单打开期间保持自己不关闭。 */
	onOpenChange?: (open: boolean) => void
	className?: string
}

/**
 * 思考强度的唯一控件：一行「思考强度 ［当前值 ⌄］」，点开是带勾选的档位列表，首项是显式「默认」。
 * 档位数量不固定（2 到 7 档），列表比一排胶囊更稳，也不会撑开所在容器。
 * 面板底栏和模型行的悬停卡共用它；显示值从持久化偏好和后台默认推导，不持有本地状态。
 */
export function ReasoningEffortSelect({
	model,
	onReasoningEffortChange,
	side = "top",
	align = "end",
	onOpenChange,
	className,
}: ReasoningEffortSelectProps) {
	const { t } = useTranslation("super")
	const [open, setOpen] = useState(false)
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
	const levels = getSelectableReasoningLevels(model)
	const canSelect = levels.length > 0
	const selected = canSelect ? getModelDisplayedReasoningEffort(model) : undefined
	const selectedLabel = selected ? labels[selected] : defaultLabel
	const options: Array<ReasoningEffort | undefined> = [undefined, ...levels]

	function changeOpen(value: boolean) {
		setOpen(value)
		onOpenChange?.(value)
	}

	function selectEffort(effort?: ReasoningEffort) {
		modelCache.setReasoningEffort(model, effort)
		changeOpen(false)
		onReasoningEffortChange({ ...model, reasoning_effort: effort ?? null })
	}

	const trigger = (
		<button
			type="button"
			disabled={!canSelect}
			className={cn(
				"flex h-7 w-full min-w-0 items-center justify-between gap-3 rounded-md px-1.5 text-left text-xs",
				"outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
				canSelect ? "hover:bg-muted/60" : "cursor-default",
				open && "bg-muted/60",
				className,
			)}
			aria-expanded={canSelect ? open : undefined}
			data-testid={
				canSelect ? "model-switch-reasoning-trigger" : "model-switch-reasoning-locked"
			}
		>
			<span className="shrink-0 text-muted-foreground">
				{t("messageEditor.modelSwitch.reasoning.label")}
			</span>
			<span
				className={cn(
					"flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-foreground",
					canSelect && "bg-muted",
				)}
			>
				{selectedLabel}
				{canSelect ? (
					<ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
				) : null}
			</span>
		</button>
	)

	// 没有可选档位时只展示固定的「默认」，不挂菜单。
	if (!canSelect) return trigger

	return (
		<Popover open={open} onOpenChange={changeOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent
				data-testid="model-switch-reasoning-menu"
				// 菜单挂在 Portal 里；父级 DropdownMenu 据此属性不把它当作外部点击。
				data-model-switch-details-overlay
				side={side}
				align={align}
				sideOffset={6}
				collisionPadding={12}
				// 层级不低于模型面板本身，向上弹出盖在列表上时不会被面板挡住。
				className="z-dropdown w-36 rounded-lg p-0 duration-100"
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
									className="h-8 w-full justify-between px-2 text-xs font-normal"
									onClick={() => selectEffort(level)}
									aria-pressed={selected === level}
									data-testid={`model-switch-reasoning-option-${level ?? "default"}`}
								>
									{level ? labels[level] : defaultLabel}
									{selected === level ? (
										<Check className="size-3.5" aria-hidden="true" />
									) : null}
								</Button>
							</div>
						))}
					</div>
				</ScrollArea>
			</PopoverContent>
		</Popover>
	)
}
