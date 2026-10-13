import { Check, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import FlexBox from "@/components/base/FlexBox"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { cn } from "@/utils/cn"
import type React from "react"
import type { ModelItem, ModelListGroup, MessageEditorSize, ModelSelectionState } from "../types"
import { isModelDisabled } from "../utils"
import { CollapsibleDescription } from "./CollapsibleDescription"
import ModelIcon from "./ModelIcon"
import ModelName from "./ModelName"
import ModelTags from "./ModelTags"
import ProviderName from "./ProviderName"

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
	getModelState?: (model: ModelItem) => ModelSelectionState | undefined
}

export function ModelGroupSection({
	item,
	selectedModel,
	size,
	onModelClick,
	selectedItemRef,
	getModelDescription,
	getModelState,
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
		<FlexBox gap={4} vertical className="last:border-b-0 last:pb-0">
			<ProviderName item={item.group} />
			<div className="flex flex-col gap-1">
				{item.displayModels.map((model) => {
					const modelState = getModelState?.(model)
					const isSelectionDisabled = modelState?.disabled ?? false
					// 场景受限的原模型仍用作滚动定位，但不再显示可切换候选的勾选。
					const isCurrentModel = selectedModel?.model_id === model.model_id
					const isSelected = isCurrentModel && !isSelectionDisabled
					const isDisabled = isModelDisabled(model)
					const isUnavailable = isDisabled || isSelectionDisabled
					const description = modelState?.reason ?? getModelDescription(model)
					const ariaLabel = [
						model.model_name || model.model_id,
						modelState?.label,
						description,
					]
						.filter(Boolean)
						.join("，")

					if (!isMobile) {
						return (
							<div
								key={model.model_id}
								ref={isCurrentModel ? selectedItemRef : null}
								className={cn(
									"flex items-center rounded px-3 py-2",
									"relative cursor-pointer gap-2.5 transition-all duration-200",
									"group",
									"[@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent",
									isDisabled && "cursor-not-allowed opacity-50",
									isSelectionDisabled && "cursor-not-allowed",
								)}
								onClick={() => {
									if (!isSelectionDisabled) onModelClick(model)
								}}
								role="button"
								tabIndex={isUnavailable ? -1 : 0}
								onKeyDown={(event) => {
									if (isUnavailable) return
									if (event.key !== "Enter" && event.key !== " ") return
									event.preventDefault()
									onModelClick(model)
								}}
								aria-label={ariaLabel}
								aria-disabled={isUnavailable || undefined}
								title={description || model.model_name || model.model_id}
								data-testid="model-switch-item"
								data-model-id={model.model_id}
								data-model-name={model.model_name}
								data-selected={isSelected}
							>
								<FlexBox vertical gap={1} flex={1} className="min-w-0">
									<FlexBox gap={2} align="center">
										<ModelName
											model={model}
											isSelected={false}
											className={cn(
												"w-fit max-w-full",
												isDisabled && "opacity-50",
											)}
										/>
										<ModelTags model={model} />
										{modelState && (
											<span className="inline-flex shrink-0 items-center gap-1 text-xs font-normal leading-4 text-amber-600 dark:text-amber-400">
												<TriangleAlert
													className="size-4 shrink-0"
													aria-hidden
												/>
												{modelState.label}
											</span>
										)}
									</FlexBox>
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
								</FlexBox>
								{!isSelectionDisabled && (
									<Checkbox
										checked={isSelected}
										onCheckedChange={() => onModelClick(model)}
										onClick={(event) => event.stopPropagation()}
										className={cn(
											"flex-shrink-0",
											"invisible opacity-0 transition-opacity",
											"[@media(hover:hover)_and_(pointer:fine)]:group-hover:visible",
											"[@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100",
											isSelected && "visible opacity-100",
										)}
									/>
								)}
							</div>
						)
					}

					return (
						<div
							key={model.model_id}
							ref={isCurrentModel ? selectedItemRef : null}
							className={cn(
								"flex h-12 items-center gap-3 rounded-full px-[7px] pr-4",
								"relative cursor-pointer text-left transition-all duration-200",
								isSelected &&
									"bg-card shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_0px_rgba(0,0,0,0.1)]",
								!isSelected &&
									"[@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/60",
								isDisabled && "cursor-not-allowed opacity-50",
								isSelectionDisabled && "cursor-not-allowed",
								modelState && "h-auto min-h-12 py-2",
							)}
							onClick={() => {
								if (!isSelectionDisabled) onModelClick(model)
							}}
							role="button"
							tabIndex={isUnavailable ? -1 : 0}
							onKeyDown={(event) => {
								if (isUnavailable) return
								if (event.key !== "Enter" && event.key !== " ") return
								event.preventDefault()
								onModelClick(model)
							}}
							aria-label={ariaLabel}
							aria-disabled={isUnavailable || undefined}
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
									{modelState && (
										<span className="inline-flex shrink-0 items-center gap-1 text-xs font-normal leading-4 text-amber-600 dark:text-amber-400">
											<TriangleAlert
												className="size-4 shrink-0"
												aria-hidden
											/>
											{modelState.label}
										</span>
									)}
								</FlexBox>
								{modelState && (
									<p className="text-xs leading-4 text-muted-foreground">
										{modelState.reason}
									</p>
								)}
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
