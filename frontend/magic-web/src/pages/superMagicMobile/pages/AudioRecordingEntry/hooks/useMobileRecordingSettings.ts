import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type { ModelListGroup } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"
import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/types"
import { getRecordingTopicModel, saveRecordingTopicModel } from "../apis/recording-settings-api"
import { apiResponseToSettings, settingsToApiPayload } from "../utils/recording-settings-mapper"
import {
	fetchSummaryModelGroups,
	resolveDefaultSummaryModelId,
	resolveValidSummaryModelId,
} from "../utils/summary-model-list"
import type {
	RecordingSettings,
	RecordingSettingsKey,
	RecordingTopicModelResponse,
} from "../types/recording-settings"

interface UseMobileRecordingSettingsOptions {
	enabled: boolean
}

interface UseMobileRecordingSettingsResult {
	settings: RecordingSettings | null
	summaryModels: ModelItem[]
	summaryModelGroups: ModelListGroup[]
	selectedModel: ModelItem | null
	isLoading: boolean
	isRefreshing: boolean
	isSaving: boolean
	updateSetting: (key: RecordingSettingsKey, value: boolean | string) => Promise<void>
}

/** Module-level cache for Phase 3 consumers (recording entry facade) */
let cachedApiResponse: RecordingTopicModelResponse | null = null
let cachedSettings: RecordingSettings | null = null
let cachedSummaryModels: ModelItem[] = []
let cachedSummaryModelGroups: ModelListGroup[] = []

/** Exposes stable cached settings for non-hook consumers */
export function getCachedMobileRecordingSettings() {
	return cachedSettings
}

/** Clears module cache — test-only helper to avoid cross-test leakage */
export function resetMobileRecordingSettingsCacheForTests() {
	cachedApiResponse = null
	cachedSettings = null
	cachedSummaryModels = []
	cachedSummaryModelGroups = []
}

/** Seeds module cache — test-only helper for updateSetting without async bootstrap */
export function seedMobileRecordingSettingsCacheForTests(
	response: RecordingTopicModelResponse,
	settings: RecordingSettings,
	summaryModels: ModelItem[] = [],
	summaryModelGroups: ModelListGroup[] = [],
) {
	cachedApiResponse = response
	cachedSettings = settings
	cachedSummaryModels = summaryModels
	cachedSummaryModelGroups = summaryModelGroups
}

/** Returns whether cached settings are complete enough to render without a blocking spinner. */
function hasRenderableCachedSettings() {
	return (
		cachedSettings !== null &&
		cachedSummaryModels.length > 0 &&
		cachedSummaryModelGroups.length > 0
	)
}

/** Syncs freshly loaded settings/model data into both hook state and module-level cache. */
function applyLoadedSettingsCache(
	apiResponse: RecordingTopicModelResponse,
	nextSettings: RecordingSettings,
	models: ModelItem[],
	groups: ModelListGroup[],
) {
	cachedApiResponse = {
		...apiResponse,
		model: { ...apiResponse.model, model_id: nextSettings.model_id },
		extra: {
			...apiResponse.extra,
			model: {
				...apiResponse.extra?.model,
				model_id: nextSettings.model_id,
			},
		},
	}
	cachedSettings = nextSettings
	cachedSummaryModels = models
	cachedSummaryModelGroups = groups

	return cachedApiResponse
}

/** Loads and persists default_audio recording settings with optimistic PUT + rollback */
export function useMobileRecordingSettings({
	enabled,
}: UseMobileRecordingSettingsOptions): UseMobileRecordingSettingsResult {
	const { t } = useTranslation("super")
	const saveFailedMessage = t("mobile.recordingEntry.settings.saveFailed")
	const [settings, setSettings] = useState<RecordingSettings | null>(cachedSettings)
	const [summaryModels, setSummaryModels] = useState<ModelItem[]>(cachedSummaryModels)
	const [summaryModelGroups, setSummaryModelGroups] =
		useState<ModelListGroup[]>(cachedSummaryModelGroups)
	const [isLoading, setIsLoading] = useState(false)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const cachedResponseRef = useRef<RecordingTopicModelResponse | null>(cachedApiResponse)

	const persistSettings = useCallback(
		async (nextSettings: RecordingSettings) => {
			const cachedResponse = cachedResponseRef.current
			if (!cachedResponse) return

			const previousSettings = cachedSettings
			cachedSettings = nextSettings
			setSettings(nextSettings)
			setIsSaving(true)

			try {
				await saveRecordingTopicModel(settingsToApiPayload(nextSettings, cachedResponse))
				cachedResponseRef.current = {
					...cachedResponse,
					model: { ...cachedResponse.model, model_id: nextSettings.model_id },
					extra: {
						...cachedResponse.extra,
						transcription_enabled: nextSettings.transcription_enabled,
						auto_summary_enabled: nextSettings.auto_summary_enabled,
						model: {
							...cachedResponse.extra?.model,
							model_id: nextSettings.model_id,
						},
					},
				}
				cachedApiResponse = cachedResponseRef.current
			} catch {
				cachedSettings = previousSettings
				setSettings(previousSettings)
				toast.error(saveFailedMessage)
			} finally {
				setIsSaving(false)
			}
		},
		[saveFailedMessage],
	)

	const loadSettings = useCallback(
		async (options: { silentlyRefresh: boolean }) => {
			const { silentlyRefresh } = options

			// Silent refresh keeps cached values visible while the latest data is fetched in background.
			setIsLoading(!silentlyRefresh)
			setIsRefreshing(silentlyRefresh)

			try {
				const [apiResponse, groups] = await Promise.all([
					getRecordingTopicModel(),
					fetchSummaryModelGroups(),
				])
				const models = groups.flatMap((group) => group.models ?? [])

				const fallbackModelId = resolveDefaultSummaryModelId(models)
				let nextSettings = apiResponseToSettings(apiResponse, fallbackModelId)
				const validModelId = resolveValidSummaryModelId(models, nextSettings.model_id)

				if (validModelId && validModelId !== nextSettings.model_id) {
					nextSettings = { ...nextSettings, model_id: validModelId }
					cachedResponseRef.current = apiResponse
					cachedApiResponse = apiResponse
					await saveRecordingTopicModel(settingsToApiPayload(nextSettings, apiResponse))
				}

				cachedResponseRef.current = applyLoadedSettingsCache(
					apiResponse,
					nextSettings,
					models,
					groups,
				)
				setSummaryModelGroups(groups)
				setSummaryModels(models)
				setSettings(nextSettings)
			} catch {
				toast.error(saveFailedMessage)
			} finally {
				setIsLoading(false)
				setIsRefreshing(false)
			}
		},
		[saveFailedMessage],
	)

	useEffect(() => {
		if (!enabled) return
		void loadSettings({ silentlyRefresh: hasRenderableCachedSettings() })
	}, [enabled, loadSettings])

	const updateSetting = useCallback(
		async (key: RecordingSettingsKey, value: boolean | string) => {
			if (!settings) return

			const nextSettings: RecordingSettings = {
				...settings,
				[key]: value,
			}

			await persistSettings(nextSettings)
		},
		[persistSettings, settings],
	)

	const selectedModel =
		summaryModels.find((model) => model.model_id === settings?.model_id) ?? null

	return {
		settings,
		summaryModels,
		summaryModelGroups,
		selectedModel,
		isLoading,
		isRefreshing,
		isSaving,
		updateSetting,
	}
}
