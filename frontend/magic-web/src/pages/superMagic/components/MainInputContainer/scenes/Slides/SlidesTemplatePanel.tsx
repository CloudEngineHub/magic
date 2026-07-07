import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent } from "react"
import type { JSONContent } from "@tiptap/core"
import { X } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import CollapsiblePanel from "../../panels/CollapsiblePanel"
import FilterBar from "../../panels/FilterBar"
import { useLocaleText } from "../../panels/hooks/useLocaleText"
import {
	type FieldItem,
	type FieldPanelConfig,
	type OptionItem,
	type LocaleText,
} from "../../panels/types"
import {
	buildConcatenatedPresetContent,
	findComplexField,
	isComplexField,
	localeTextToDisplayString,
} from "../../panels/utils"
import { ScenePanelVariant } from "../../components/LazyScenePanel/types"
import { useOptionalSceneStateStore } from "../../stores"
import { ALL_SLIDES_TEMPLATE_GROUP_KEY } from "./slidesTemplateState"
import SlidesTemplateFloatingSelector from "./SlidesTemplateFloatingSelector"
import SlidesTemplatePanelContent from "./SlidesTemplatePanelContent"
import { useSlidesTemplatePanelState } from "./useSlidesTemplatePanelState"

interface SlidesTemplatePanelProps {
	config: FieldPanelConfig
	onTemplateSelect?: (template: OptionItem | null) => void
	onFilterChange?: (filters: FieldItem[]) => void
	onPresetContentChange?: (content: JSONContent | undefined) => void
	readOnly?: boolean
	variant?: ScenePanelVariant
	compact?: boolean
}

function getInitialFilterValue(item: FieldItem): string {
	return localeTextToDisplayString(item.default_value)
}

function createRuntimeFieldItems(config: FieldPanelConfig): FieldItem[] {
	return (config.field?.items ?? []).map((item) => ({
		...item,
		current_value: getInitialFilterValue(item),
	}))
}

function updateFieldValue(
	fieldItems: FieldItem[],
	predicate: (item: FieldItem) => boolean,
	value: string | LocaleText,
) {
	return fieldItems.map((item) =>
		predicate(item)
			? {
					...item,
					current_value: localeTextToDisplayString(value),
				}
			: item,
	)
}

function SlidesTemplatePanel({
	config,
	onTemplateSelect,
	onFilterChange,
	onPresetContentChange,
	readOnly = false,
	variant,
	compact = false,
}: SlidesTemplatePanelProps) {
	const lt = useLocaleText()
	const { t } = useTranslation("crew/create")
	const sceneStateStore = useOptionalSceneStateStore()
	const inputScopeKey = sceneStateStore?.inputScopeKey ?? ""
	const sendCount = sceneStateStore?.sendCount
	const slidesState = useSlidesTemplatePanelState()
	const { setKeyword, setSelectedGroupKey } = slidesState
	const [fieldItems, setFieldItems] = useState(() => createRuntimeFieldItems(config))
	const [selectedTemplate, setSelectedTemplate] = useState<OptionItem | null>(null)

	useEffect(() => {
		setFieldItems(createRuntimeFieldItems(config))
		setSelectedTemplate(null)
		setKeyword("")
		setSelectedGroupKey(ALL_SLIDES_TEMPLATE_GROUP_KEY)
	}, [config, inputScopeKey, setKeyword, setSelectedGroupKey])

	useEffect(() => {
		if (!sendCount) return
		const nextFieldItems = createRuntimeFieldItems(config)
		setFieldItems(nextFieldItems)
		setSelectedTemplate(null)
		setKeyword("")
		setSelectedGroupKey(ALL_SLIDES_TEMPLATE_GROUP_KEY)
	}, [config, sendCount, setKeyword, setSelectedGroupKey])

	const simpleFields = useMemo(
		() => fieldItems.filter((item) => !isComplexField(item)),
		[fieldItems],
	)
	const concatenatedContent = useMemo(
		() => buildConcatenatedPresetContent(fieldItems),
		[fieldItems],
	)

	useEffect(() => {
		if (readOnly) return
		onPresetContentChange?.(concatenatedContent)
	}, [concatenatedContent, onPresetContentChange, readOnly])

	const applyFieldItems = (nextFieldItems: FieldItem[]) => {
		setFieldItems(nextFieldItems)
		onFilterChange?.(nextFieldItems)
	}

	const handleFilterChange = (filterId: string, value: string) => {
		if (readOnly) return
		applyFieldItems(updateFieldValue(fieldItems, (item) => item.data_key === filterId, value))
	}

	const handleTemplateClick = (template: OptionItem) => {
		if (readOnly) return
		const nextFieldItems = updateFieldValue(fieldItems, isComplexField, template.value)
		setSelectedTemplate(template)
		applyFieldItems(nextFieldItems)
		onTemplateSelect?.(template)
	}

	const clearTemplateSelection = () => {
		if (readOnly) return

		const nextFieldItems = updateFieldValue(fieldItems, isComplexField, "")
		setSelectedTemplate(null)
		applyFieldItems(nextFieldItems)
		onTemplateSelect?.(null)
	}

	const handleTemplateClear = (event: MouseEvent<HTMLButtonElement>) => {
		if (readOnly) return

		event.preventDefault()
		event.stopPropagation()
		clearTemplateSelection()
	}

	const handleHeaderFilterInteraction = (
		event: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>,
	) => {
		event.stopPropagation()
	}

	const title = lt(config.title) || t("playbook.edit.presets.title")
	const selectedTemplateTitle =
		lt(selectedTemplate?.label) ??
		lt(selectedTemplate?.value) ??
		String(selectedTemplate?.value ?? "")
	const complexField = findComplexField(fieldItems)

	if (!complexField) return null
	if (slidesState.hasCheckedAnyTemplate && !slidesState.hasAnyTemplate) return null

	if (variant && [ScenePanelVariant.TopicPage, ScenePanelVariant.Mobile].includes(variant)) {
		return (
			<SlidesTemplateFloatingSelector
				title={title}
				selectedTemplate={selectedTemplate}
				selectedTemplateTitle={selectedTemplateTitle}
				simpleFields={simpleFields}
				slidesState={slidesState}
				onFilterChange={handleFilterChange}
				onTemplateClick={handleTemplateClick}
				onTemplateClear={clearTemplateSelection}
				readOnly={readOnly}
				variant={variant}
				compact={compact}
			/>
		)
	}

	return (
		<CollapsiblePanel
			expandable={config.expandable}
			defaultExpanded={config.default_expanded}
			header={
				<div className="flex flex-1 items-center justify-between">
					<div className="flex shrink-0 items-center gap-2">
						<span className="font-medium">{title}</span>
						<span
							className={cn(
								"inline-flex flex-shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none shadow-sm",
								selectedTemplate
									? "border-primary/20 bg-primary/10 text-primary"
									: "border-border bg-muted/50 text-muted-foreground",
							)}
						>
							{selectedTemplate ? (
								<>
									<span className="mr-1 text-primary/70">
										{t("playbook.edit.presets.selected")}
									</span>
									{selectedTemplateTitle}
									<button
										type="button"
										aria-label={t("playbook.edit.presets.clearSelection")}
										data-testid="slides-template-panel-template-clear-button"
										className="ml-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/15 hover:text-primary"
										onClick={handleTemplateClear}
									>
										<X className="size-3" />
									</button>
								</>
							) : (
								t("playbook.edit.presets.unselected")
							)}
						</span>
					</div>
					<div
						className="min-w-0 flex-1"
						onPointerDown={handleHeaderFilterInteraction}
						onClick={handleHeaderFilterInteraction}
					>
						<FilterBar
							filters={simpleFields}
							onFilterChange={handleFilterChange}
							variant={variant}
							scrollContainerClassName="justify-end"
							compact={compact}
						/>
					</div>
				</div>
			}
		>
			<SlidesTemplatePanelContent
				slidesState={slidesState}
				selectedTemplate={selectedTemplate}
				onTemplateClick={handleTemplateClick}
			/>
		</CollapsiblePanel>
	)
}

export default observer(SlidesTemplatePanel)
