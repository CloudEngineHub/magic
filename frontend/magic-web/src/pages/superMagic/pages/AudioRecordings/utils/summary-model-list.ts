import { SuperMagicApi } from "@/apis"
import type { ModelListGroup } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"
import {
	isAutoModel,
	isModelDisabled,
} from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/utils"
import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"

/** Filters out disabled/deleted models from summary mode list */
export function filterAvailableSummaryModels(models: ModelItem[]): ModelItem[] {
	return models.filter((model) => !isModelDisabled(model))
}

/** Removes disabled models from each group and drops groups that become empty */
function filterAvailableSummaryModelGroups(groups: ModelListGroup[]): ModelListGroup[] {
	return groups
		.map((group) => {
			const models = filterAvailableSummaryModels(group.models ?? [])
			return {
				...group,
				models,
				model_ids: models.map((model) => model.model_id),
			}
		})
		.filter((group) => (group.models?.length ?? 0) > 0)
}

/** Wraps a flat model list as a single anonymous group so mobile UI never renders blank */
function wrapFlatModelsAsSingleGroup(models: ModelItem[]): ModelListGroup[] {
	if (!models.length) return []

	return [
		{
			group: {
				id: "summary-models-fallback",
				mode_id: "",
				icon: "",
				color: "",
				name: "",
				description: "",
				sort: 0,
				status: true,
				created_at: "",
			},
			models,
			model_ids: models.map((model) => model.model_id),
			image_model_ids: [],
			video_model_ids: [],
		},
	]
}

/** Resolves default model_id: prefer auto model, else first available summary model */
export function resolveDefaultSummaryModelId(models: ModelItem[]): string {
	const availableModels = filterAvailableSummaryModels(models)
	const autoModel = availableModels.find(isAutoModel)
	if (autoModel?.model_id) return autoModel.model_id
	return availableModels[0]?.model_id ?? ""
}

/** Loads summary-mode model groups, preserving provider grouping for mobile UI */
export async function fetchSummaryModelGroups(): Promise<ModelListGroup[]> {
	try {
		const response = await SuperMagicApi.getModeList()
		const summaryMode = response.list?.find(
			(item) => item.mode.identifier === TopicMode.RecordSummary,
		)
		const groups = summaryMode?.groups ?? []
		const filteredGroups = filterAvailableSummaryModelGroups(groups)

		if (filteredGroups.length > 0) return filteredGroups
	} catch {
		// Fall through to featured/mode-service cache when modes API is empty or fails.
	}

	await superMagicModeService.fetchModeList()
	const cachedGroups = superMagicModeService.getModelGroupsByMode(TopicMode.RecordSummary) ?? []
	const filteredCachedGroups = filterAvailableSummaryModelGroups(cachedGroups)

	if (filteredCachedGroups.length > 0) return filteredCachedGroups

	return wrapFlatModelsAsSingleGroup(
		filterAvailableSummaryModels(
			superMagicModeService.getModelListByMode(TopicMode.RecordSummary),
		),
	)
}

/** Loads summary-mode models from groups so flat list stays consistent with grouped UI */
export async function fetchSummaryModelList(): Promise<ModelItem[]> {
	const groups = await fetchSummaryModelGroups()
	return groups.flatMap((group) => group.models ?? [])
}

/** Picks a valid model_id, falling back when current selection is missing or disabled */
export function resolveValidSummaryModelId(models: ModelItem[], currentModelId?: string): string {
	const availableModels = filterAvailableSummaryModels(models)
	if (!availableModels.length) return currentModelId ?? ""

	const matched = availableModels.find((model) => model.model_id === currentModelId)
	if (matched) return matched.model_id

	return resolveDefaultSummaryModelId(availableModels)
}
