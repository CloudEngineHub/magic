import { Check } from "lucide-react"
import FlexBox from "@/components/base/FlexBox"
import { cn } from "@/utils/cn"
import type React from "react"
import type { ModelItem, ModelListGroup, MessageEditorSize } from "../types"
import { isModelDisabled } from "../utils"
import { ModelInfoHoverCard } from "./ModelInfoHoverCard"
import ModelName from "./ModelName"
import ModelTags from "./ModelTags"
import ProviderName from "./ProviderName"
import { ModelBillingMultiplier } from "./ModelBillingMultiplier"
import { MobileModelRow } from "./MobileModelRow"

export interface RenderableModelGroup extends ModelListGroup {
	displayModels: ModelItem[]
}

interface ModelGroupSectionProps {
	item: RenderableModelGroup
	selectedModel: ModelItem | null
	size: MessageEditorSize
	onModelClick: (model: ModelItem) => void
	/** 桌面信息卡里选档位时回调；调用方把它当作选中该模型。 */
	onReasoningEffortChange?: (model: ModelItem) => void
	selectedItemRef: React.RefObject<HTMLDivElement>
	getModelDescription: (model: ModelItem) => string | undefined
	/** 桌面行悬停显示信息卡；移动端弹层没有悬停，传 false。 */
	showModelInfo?: boolean
}

export function ModelGroupSection({
	item,
	selectedModel,
	size,
	onModelClick,
	onReasoningEffortChange,
	selectedItemRef,
	getModelDescription,
	showModelInfo = true,
}: ModelGroupSectionProps) {
	const isMobile = size === "mobile"

	return (
		<FlexBox gap={1} vertical className="last:border-b-0 last:pb-0">
			<ProviderName item={item.group} />
			<div className="flex flex-col gap-0.5">
				{item.displayModels.map((model) => {
					const isSelected = selectedModel?.model_id === model.model_id
					const isDisabled = isModelDisabled(model)
					const description = getModelDescription(model)
					if (isMobile) {
						return (
							<MobileModelRow
								key={model.model_id}
								model={model}
								selected={isSelected}
								disabled={isDisabled}
								selectedItemRef={selectedItemRef}
								onSelect={onModelClick}
							/>
						)
					}
					const ariaLabel = description
						? `${model.model_name || model.model_id}，${description}`
						: model.model_name || model.model_id

					// 桌面紧凑行，语言、生图、视频三个 Tab 共用：
					// 分组标题已经带供应商图标，行内不再重复，并整体向右缩进一级形成层级；
					// 选中态只靠勾号和名称加重表达，浅灰底留给悬停，两种状态不会混淆；描述放进悬停信息卡。
					const row = (
						<div
							key={model.model_id}
							ref={isSelected ? selectedItemRef : null}
							className={cn(
								"ml-5 flex h-8 items-center gap-2 rounded-lg px-2",
								"cursor-pointer transition-colors duration-100",
								"[@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60",
								"outline-none focus-visible:ring-2 focus-visible:ring-ring",
								isDisabled && "cursor-not-allowed opacity-50",
							)}
							onClick={() => onModelClick(model)}
							role="button"
							tabIndex={isDisabled ? -1 : 0}
							onKeyDown={(event) => {
								if (isDisabled) return
								if (event.key !== "Enter" && event.key !== " ") return
								event.preventDefault()
								onModelClick(model)
							}}
							aria-label={ariaLabel}
							aria-pressed={isSelected}
							data-testid="model-switch-item"
							data-model-id={model.model_id}
							data-model-name={model.model_name}
							data-selected={isSelected}
						>
							<FlexBox gap={2} align="center" flex={1} className="min-w-0">
								<ModelName
									model={model}
									isSelected={false}
									className={cn(
										// 覆盖 ModelName 自带的 120px 上限，名称尽量完整显示，只在真的放不下时截断。
										"min-w-0 !max-w-none flex-1 !text-[13px] !font-medium",
										isSelected ? "!text-foreground" : "text-foreground/80",
										isDisabled && "opacity-50",
									)}
								/>
								<ModelTags model={model} />
							</FlexBox>
							{/* 倍率用 Inter 小字，和名称拉开层级，也不抢名称的宽度。 */}
							<ModelBillingMultiplier
								value={model.billing_multiplier}
								className="text-[11px] leading-4 [font-family:Inter,sans-serif]"
							/>
							{/* 固定勾选列，倍率在每一行保持同一条垂直基线。 */}
							<span
								className="flex size-5 shrink-0 items-center justify-center"
								aria-hidden="true"
							>
								{isSelected ? (
									<Check
										className="size-4 text-foreground"
										strokeWidth={2}
										data-testid="model-switch-item-selected-icon"
									/>
								) : null}
							</span>
						</div>
					)
					if (!showModelInfo) return row
					return (
						<ModelInfoHoverCard
							key={model.model_id}
							model={model}
							description={description}
							onReasoningEffortChange={
								isDisabled ? undefined : onReasoningEffortChange
							}
						>
							{row}
						</ModelInfoHoverCard>
					)
				})}
			</div>
		</FlexBox>
	)
}
