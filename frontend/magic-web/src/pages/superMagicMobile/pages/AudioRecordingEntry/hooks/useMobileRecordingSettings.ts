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
	isSaving: boolean
	updateSetting: (key: RecordingSettingsKey, value: boolean | string) => Promise<void>
}

/** Module-level cache for Phase 3 consumers (recording entry facade) */
let cachedApiResponse: RecordingTopicModelResponse | null = null
let cachedSettings: RecordingSettings | null = null

/** Exposes stable cached settings for non-hook consumers */
export function getCachedMobileRecordingSettings() {
	return cachedSettings
}

/** Clears module cache — test-only helper to avoid cross-test leakage */
export function resetMobileRecordingSettingsCacheForTests() {
	cachedApiResponse = null
	cachedSettings = null
}

/** Seeds module cache — test-only helper for updateSetting without async bootstrap */
export function seedMobileRecordingSettingsCacheForTests(
	response: RecordingTopicModelResponse,
	settings: RecordingSettings,
) {
	cachedApiResponse = response
	cachedSettings = settings
}

/** Loads and persists default_audio recording settings with optimistic PUT + rollback */
export function useMobileRecordingSettings({
	enabled,
}: UseMobileRecordingSettingsOptions): UseMobileRecordingSettingsResult {
	const { t } = useTranslation("super")
	const [settings, setSettings] = useState<RecordingSettings | null>(cachedSettings)
	const [summaryModels, setSummaryModels] = useState<ModelItem[]>([])
	const [summaryModelGroups, setSummaryModelGroups] = useState<ModelListGroup[]>([])
	const [isLoading, setIsLoading] = useState(false)
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
				toast.error(t("mobile.recordingEntry.settings.saveFailed"))
			} finally {
				setIsSaving(false)
			}
		},
		[t],
	)

	const loadSettings = useCallback(async () => {
		setIsLoading(true)

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

			cachedResponseRef.current = {
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
			cachedApiResponse = cachedResponseRef.current
			cachedSettings = nextSettings
			setSummaryModelGroups(groups)
			setSummaryModels(models)
			setSettings(nextSettings)
		} catch {
			toast.error(t("mobile.recordingEntry.settings.saveFailed"))
		} finally {
			setIsLoading(false)
		}
	}, [t])

	useEffect(() => {
		if (!enabled) return
		void loadSettings()
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
		isSaving,
		updateSetting,
	}
}
