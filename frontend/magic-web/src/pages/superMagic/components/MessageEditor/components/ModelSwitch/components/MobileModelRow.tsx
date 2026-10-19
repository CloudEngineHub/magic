import { Check } from "lucide-react"
import type { RefObject } from "react"
import { cn } from "@/utils/cn"
import type { ModelItem } from "../types"
import { ModelBillingMultiplier } from "./ModelBillingMultiplier"
import ModelIcon from "./ModelIcon"

interface MobileModelRowProps {
	model: ModelItem
	selected: boolean
	variant?: "mobile" | "desktop"
	disabled: boolean
	selectedItemRef: RefObject<HTMLDivElement>
	onSelect: (model: ModelItem) => void
}

/** 紧凑模型行。移动端思考强度不从行上悬停打开，由底部点按条修改。 */
export function MobileModelRow({
	model,
	selected,
	variant = "mobile",
	disabled,
	selectedItemRef,
	onSelect,
}: MobileModelRowProps) {
	const name = model.model_name || model.model_id
	const isDesktop = variant === "desktop"

	return (
		<div
			ref={selected ? selectedItemRef : null}
			className={cn(
				"min-w-0 overflow-hidden transition-colors",
				isDesktop
					? "rounded-xl border border-transparent"
					: "rounded-2xl border border-transparent",
				selected && "bg-muted/80",
				disabled && "opacity-50",
			)}
			data-testid={isDesktop ? "model-switch-inline-row" : "mobile-model-row"}
		>
			<div className={cn("flex min-h-14 items-center", isDesktop ? "px-3" : "px-1")}>
				<button
					type="button"
					disabled={disabled}
					onClick={() => onSelect(model)}
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
					</span>
				</button>
				<div className="flex shrink-0 items-center gap-2 pl-2 pr-1">
					<ModelBillingMultiplier value={model.billing_multiplier} />
					{selected && <Check className="size-4 text-primary" aria-hidden="true" />}
				</div>
			</div>
		</div>
	)
}
