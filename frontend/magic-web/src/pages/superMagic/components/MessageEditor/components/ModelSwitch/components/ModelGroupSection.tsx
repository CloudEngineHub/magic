import { Check } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import FlexBox from "@/components/base/FlexBox"
import { cn } from "@/utils/cn"
import type React from "react"
import type { ModelItem, ModelListGroup, MessageEditorSize } from "../types"
import { isModelDisabled } from "../utils"
import { CollapsibleDescription } from "./CollapsibleDescription"
import ModelIcon from "./ModelIcon"
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
	selectedItemRef: React.RefObject<HTMLDivElement>
	getModelDescription: (model: ModelItem) => string | undefined
	isLanguageModel?: boolean
	/** 桌面语言模型行悬停显示只读信息卡；移动端弹层没有悬停，传 false。 */
	showModelInfo?: boolean
}

export function ModelGroupSection({
	item,
	selectedModel,
	size,
	onModelClick,
	selectedItemRef,
	getModelDescription,
	isLanguageModel = true,
	showModelInfo = true,
}: ModelGroupSectionProps) {
	const { t } = useTranslation("super")
	const isMobile = size === "mobile"
	const iconSize = size === "small" ? 24 : 28
	const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({})

	function toggleDescription(modelId: string, event: React.MouseEvent<HTMLButtonElement>) {
		event.stopPropagation()
		setExpandedDescriptions((prev) => ({
			...prev,
			[modelId]: !prev[modelId],
		}))
	}

	return (
		<FlexBox gap={2} vertical className="last:border-b-0 last:pb-0">
			<ProviderName item={item.group} />
			<div className="flex flex-col gap-0.5">
				{item.displayModels.map((model) => {
					const isSelected = selectedModel?.model_id === model.model_id
					const isDisabled = isModelDisabled(model)
					const description = getModelDescription(model)
					if (isLanguageModel && isMobile) {
						return (
							<MobileModelRow
								key={model.model_id}
								model={model}
								selected={isSelected}
								variant="mobile"
								disabled={isDisabled}
								selectedItemRef={selectedItemRef}
								onSelect={onModelClick}
							/>
						)
					}
					const ariaLabel = description
						? `${model.model_name || model.model_id}，${description}`
						: model.model_name || model.model_id

					if (!isMobile) {
						// 桌面紧凑行：分组标题已经带供应商图标，行内不再重复；
						// 选中态只靠勾号和名称加重表达，浅灰底留给悬停，两种状态不会混淆。
						const row = (
							<div
								key={model.model_id}
								ref={isSelected ? selectedItemRef : null}
								className={cn(
									"flex min-h-9 items-center gap-3 rounded-lg px-3 py-1.5",
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
								<FlexBox vertical gap={1} flex={1} className="min-w-0">
									<FlexBox gap={2} align="center" className="min-w-0">
										<ModelName
											model={model}
											isSelected={false}
											className={cn(
												"w-fit max-w-full !text-sm !font-medium",
												isLanguageModel && "min-w-0 flex-1",
												isSelected
													? "!text-foreground"
													: "text-foreground/80",
												isDisabled && "opacity-50",
											)}
										/>
										<ModelTags model={model} />
									</FlexBox>
									{!isLanguageModel && (
										<CollapsibleDescription
											description={description}
											isDisabled={isDisabled}
											isExpanded={!!expandedDescriptions[model.model_id]}
											expandLabel={t(
												"messageEditor.modelSwitch.expandDescription",
											)}
											collapseLabel={t(
												"messageEditor.modelSwitch.collapseDescription",
											)}
											onToggle={(event) =>
												toggleDescription(model.model_id, event)
											}
										/>
									)}
								</FlexBox>
								{isLanguageModel && (
									<div className="flex min-w-[4.5rem] shrink-0 justify-end">
										<ModelBillingMultiplier
											value={model.billing_multiplier}
											className="text-sm"
										/>
									</div>
								)}
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
						if (!isLanguageModel || !showModelInfo) return row
						return (
							<ModelInfoHoverCard
								key={model.model_id}
								model={model}
								description={description}
							>
								{row}
							</ModelInfoHoverCard>
						)
					}

					return (
						<div
							key={model.model_id}
							ref={isSelected ? selectedItemRef : null}
							className={cn(
								"flex h-12 items-center gap-3 rounded-full px-[7px] pr-4",
								"relative cursor-pointer text-left transition-all duration-200",
								isSelected &&
									"bg-card shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_0px_rgba(0,0,0,0.1)]",
								!isSelected &&
									"[@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/60",
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
							title={description || model.model_name || model.model_id}
							data-testid="model-switch-item"
							data-model-id={model.model_id}
							data-model-name={model.model_name}
							data-selected={isSelected}
						>
							<div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full">
								<ModelIcon
									model={model}
									size={iconSize}
									className="size-7 rounded-full object-cover"
								/>
							</div>
							<FlexBox vertical gap={1} flex={1} className="min-w-0">
								<FlexBox gap={2} align="center" className="min-w-0">
									<ModelName
										model={model}
										isSelected={isSelected}
										className={cn(
											"max-w-full flex-1 text-[16px] font-medium text-foreground/100",
											isSelected && "text-foreground",
										)}
									/>
									<ModelTags model={model} />
								</FlexBox>
							</FlexBox>
							{isSelected ? (
								<Check
									className="size-4 shrink-0 text-foreground"
									strokeWidth={2.25}
									data-testid="model-switch-item-selected-icon"
								/>
							) : null}
						</div>
					)
				})}
			</div>
		</FlexBox>
	)
}
