import { useMemoizedFn } from "ahooks"
import { observer } from "mobx-react-lite"
import { cn } from "@/utils/cn"
import { SearchX, Sparkles } from "lucide-react"
import { MyModelsList } from "./MyModelsList"
import type { ModelItem, ModelListGroup, MessageEditorSize, ModelListKey } from "../types"
import type React from "react"
import { useTranslation } from "react-i18next"
import { isModelDisabled } from "../utils"
import { hasBillingMultiplier } from "./ModelBillingMultiplier"
import { ModelEmptyState } from "./ModelEmptyState"
import { ModelGroupSection, type RenderableModelGroup } from "./ModelGroupSection"

interface ModelListContentProps {
	modelList: ModelListGroup[]
	selectedModel: ModelItem | null
	searchKeyword: string
	size: MessageEditorSize
	onModelClick: (model: ModelItem) => void
	selectedItemRef: React.RefObject<HTMLDivElement>
	getModelDescription: (model: ModelItem) => string | undefined
	modelKey?: ModelListKey
	onModelsLoaded?: () => Promise<void> | void
	/** 桌面语言模型行悬停显示只读信息卡并带列标题；移动端弹层传 false。 */
	showModelInfo?: boolean
}

export const ModelListContent = observer(function ModelListContent({
	modelList,
	selectedModel,
	searchKeyword,
	size,
	onModelClick,
	selectedItemRef,
	getModelDescription,
	modelKey = "models",
	onModelsLoaded,
	showModelInfo = true,
}: ModelListContentProps) {
	const { t } = useTranslation("super")
	const visibleGroups = getVisibleGroups({ modelList, modelKey, searchKeyword })
	const isSearchResultEmpty = !!searchKeyword && visibleGroups.length === 0
	const EmptyStateIcon = isSearchResultEmpty ? SearchX : Sparkles
	const emptyStateTitle = isSearchResultEmpty
		? t("messageEditor.modelSwitch.noModelsFound")
		: t("messageEditor.modelSwitch.noModels")
	// 只有列表里确实下发了倍率时才需要列标题解释右侧那列数字。
	const showColumnHeader =
		showModelInfo &&
		modelKey === "models" &&
		visibleGroups.some((group) =>
			group.displayModels.some((model) => hasBillingMultiplier(model.billing_multiplier)),
		)

	const handleModelClick = useMemoizedFn((model: ModelItem) => {
		if (!isModelDisabled(model)) {
			onModelClick(model)
		}
	})

	return (
		<>
			{showColumnHeader ? (
				<div
					className="flex items-center justify-between px-3 text-[11px] leading-4 text-muted-foreground"
					aria-hidden="true"
					data-testid="model-list-column-header"
				>
					<span>{t("messageEditor.modelSwitch.columnModel")}</span>
					{/* 右侧留出勾选列（20px）加间距（12px）的宽度，标题正好落在倍率数字上方。 */}
					<span className="pr-8">{t("messageEditor.modelSwitch.columnMultiplier")}</span>
				</div>
			) : null}
			<MyModelsList
				modelKey={modelKey}
				selectedModel={selectedModel}
				onModelClick={onModelClick}
				selectedItemRef={selectedItemRef}
				onModelsLoaded={onModelsLoaded}
			/>
			{visibleGroups.length === 0 && (
				<ModelEmptyState
					icon={EmptyStateIcon}
					title={emptyStateTitle}
					description={
						isSearchResultEmpty
							? undefined
							: t("messageEditor.modelSwitch.noModelsDesc")
					}
					className={cn("mt-2.5", "mb-2.5")}
					testId="model-list-empty-state"
				/>
			)}
			{visibleGroups.map((item) => (
				<ModelGroupSection
					key={item.group.id}
					item={item}
					selectedModel={selectedModel}
					size={size}
					onModelClick={handleModelClick}
					selectedItemRef={selectedItemRef}
					getModelDescription={getModelDescription}
					isLanguageModel={modelKey === "models"}
					showModelInfo={showModelInfo}
				/>
			))}
		</>
	)
})

function getVisibleGroups({
	modelList,
	modelKey,
	searchKeyword,
}: {
	modelList: ModelListGroup[]
	modelKey: ModelListKey
	searchKeyword: string
}): RenderableModelGroup[] {
	return modelList
		.map((item) => {
			const modelItems =
				modelKey === "image_models"
					? (item.image_models ?? [])
					: modelKey === "video_models"
						? (item.video_models ?? [])
						: (item.models ?? [])
			const displayModels = modelItems.filter((model) =>
				(model.model_name || model.model_id).includes(searchKeyword),
			)

			return {
				...item,
				displayModels,
			}
		})
		.filter((item) => item.displayModels.length > 0)
}
