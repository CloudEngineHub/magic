import { Check } from "lucide-react"
import type { RefObject } from "react"
import { cn } from "@/utils/cn"
import type { ModelItem } from "../types"
import { ModelBillingMultiplier } from "./ModelBillingMultiplier"

interface MobileModelRowProps {
	model: ModelItem
	selected: boolean
	disabled: boolean
	selectedItemRef: RefObject<HTMLDivElement>
	onSelect: (model: ModelItem) => void
}

/**
 * 移动端模型行，和桌面行同一结构：分组标题带供应商图标，行内不再重复图标并向右缩进一级；
 * 选中态靠勾号与名称加重表达，倍率用小字放右侧。思考强度不在列表里改，由模式选择页的独立行负责。
 */
export function MobileModelRow({
	model,
	selected,
	disabled,
	selectedItemRef,
	onSelect,
}: MobileModelRowProps) {
	const name = model.model_name || model.model_id

	return (
		<div
			ref={selected ? selectedItemRef : null}
			className={cn("ml-6 min-w-0 rounded-xl transition-colors", disabled && "opacity-50")}
			data-testid="mobile-model-row"
		>
			<button
				type="button"
				disabled={disabled}
				onClick={() => onSelect(model)}
				aria-label={name}
				aria-pressed={selected}
				className={cn(
					"flex h-11 w-full min-w-0 items-center gap-3 rounded-xl px-2 text-left",
					"transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/60 disabled:cursor-not-allowed",
				)}
				data-testid="model-switch-item"
				data-model-id={model.model_id}
				data-model-name={model.model_name}
				data-selected={selected}
			>
				<span
					className={cn(
						"block min-w-0 flex-1 truncate text-[15px] font-medium",
						selected ? "text-foreground" : "text-foreground/80",
					)}
				>
					{name}
				</span>
				<ModelBillingMultiplier
					value={model.billing_multiplier}
					className="text-xs leading-4 [font-family:Inter,sans-serif]"
				/>
				{/* 固定勾选列，倍率在每一行保持同一条垂直基线。 */}
				<span
					className="flex size-5 shrink-0 items-center justify-center"
					aria-hidden="true"
				>
					{selected ? <Check className="size-4 text-foreground" strokeWidth={2} /> : null}
				</span>
			</button>
		</div>
	)
}
