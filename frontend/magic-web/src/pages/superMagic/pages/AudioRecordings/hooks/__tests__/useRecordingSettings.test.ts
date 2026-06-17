import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ModelStatusEnum } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
		}),
	}
})

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
	},
}))

vi.mock("../../apis/recording-settings-api", () => ({
	getRecordingTopicModel: vi.fn(),
	saveRecordingTopicModel: vi.fn(),
}))

vi.mock("../../utils/summary-model-list", () => ({
	fetchSummaryModelGroups: vi.fn(),
	resolveDefaultSummaryModelId: vi.fn(),
	resolveValidSummaryModelId: vi.fn(),
}))

import { getRecordingTopicModel, saveRecordingTopicModel } from "../../apis/recording-settings-api"
import { toast } from "sonner"
import {
	fetchSummaryModelGroups,
	resolveDefaultSummaryModelId,
	resolveValidSummaryModelId,
} from "../../utils/summary-model-list"
import {
	resetRecordingSettingsCacheForTests,
	seedRecordingSettingsCacheForTests,
	useRecordingSettings,
} from "../useRecordingSettings"

const MOCK_MODEL_ALPHA = "mock-model-alpha"
const MOCK_MODEL_BETA = "mock-model-beta"

const mockModels = [
	{
		id: MOCK_MODEL_ALPHA,
		group_id: "mock-group-1",
		model_id: MOCK_MODEL_ALPHA,
		model_name: "Mock Alpha",
		provider_model_id: MOCK_MODEL_ALPHA,
		model_description: "",
		model_icon: "",
		sort: 1,
		model_status: ModelStatusEnum.Normal,
	},
	{
		id: MOCK_MODEL_BETA,
		group_id: "mock-group-1",
		model_id: MOCK_MODEL_BETA,
		model_name: "Mock Beta",
		provider_model_id: MOCK_MODEL_BETA,
		model_description: "",
		model_icon: "",
		sort: 2,
		model_status: ModelStatusEnum.Normal,
	},
]

const mockModelGroups = [
	{
		group: {
			id: "mock-group-1",
			mode_id: "mock-mode-1",
			icon: "",
			color: "",
			name: "Mock Provider",
			description: "",
			sort: 1,
			status: true,
			created_at: "",
		},
		models: mockModels,
		model_ids: [MOCK_MODEL_ALPHA, MOCK_MODEL_BETA],
		image_model_ids: [],
	},
]

describe("useRecordingSettings", () => {
	beforeEach(() => {
		resetRecordingSettingsCacheForTests()
		vi.clearAllMocks()
		vi.mocked(fetchSummaryModelGroups).mockResolvedValue(mockModelGroups)
		vi.mocked(resolveDefaultSummaryModelId).mockReturnValue(MOCK_MODEL_ALPHA)
		vi.mocked(resolveValidSummaryModelId).mockImplementation(
			(_models, currentModelId) => currentModelId || MOCK_MODEL_ALPHA,
		)
		vi.mocked(getRecordingTopicModel).mockResolvedValue({
			model: { model_id: MOCK_MODEL_ALPHA },
			extra: {
				transcription_enabled: true,
				auto_summary_enabled: false,
			},
		})
		vi.mocked(saveRecordingTopicModel).mockResolvedValue({})
	})

	it("persists setting changes with only managed extra fields", async () => {
		seedRecordingSettingsCacheForTests(
			{
				model: { model_id: MOCK_MODEL_ALPHA },
				extra: {
					transcription_enabled: true,
					auto_summary_enabled: false,
				},
			},
			{
				transcription_enabled: true,
				auto_summary_enabled: false,
				model_id: MOCK_MODEL_ALPHA,
			},
			mockModels,
			mockModelGroups,
		)

		const { result } = renderHook(() => useRecordingSettings({ enabled: false }))

		await act(async () => {
			await result.current.updateSetting("auto_summary_enabled", true)
		})

		expect(saveRecordingTopicModel).toHaveBeenCalledWith(
			expect.objectContaining({
				extra: expect.objectContaining({
					transcription_enabled: true,
					auto_summary_enabled: true,
					model: expect.objectContaining({
						model_id: MOCK_MODEL_ALPHA,
					}),
				}),
			}),
		)
	})

	it("falls back and syncs model_id when current model is unavailable", async () => {
		vi.mocked(getRecordingTopicModel).mockResolvedValue({
			model: { model_id: "mock-disabled-model" },
			extra: {},
		})
		vi.mocked(resolveValidSummaryModelId).mockReturnValue(MOCK_MODEL_BETA)

		const { result } = renderHook(() => useRecordingSettings({ enabled: true }))

		await waitFor(() => {
			expect(result.current.settings?.model_id).toBe(MOCK_MODEL_BETA)
		})

		expect(saveRecordingTopicModel).toHaveBeenCalledWith(
			expect.objectContaining({
				model_id: MOCK_MODEL_BETA,
			}),
		)
	})

	it("shows blocking loading only on first open without cache", async () => {
		const { result } = renderHook(() => useRecordingSettings({ enabled: true }))

		expect(result.current.isLoading).toBe(true)
		expect(result.current.settings).toBeNull()

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})

		expect(result.current.settings?.model_id).toBe(MOCK_MODEL_ALPHA)
		expect(result.current.summaryModelGroups).toHaveLength(1)
	})

	it("reuses cached values and silently refreshes on reopen", async () => {
		const { result, unmount } = renderHook(({ enabled }) => useRecordingSettings({ enabled }), {
			initialProps: { enabled: true },
		})

		await waitFor(() => {
			expect(result.current.settings?.model_id).toBe(MOCK_MODEL_ALPHA)
		})
		expect(vi.mocked(getRecordingTopicModel)).toHaveBeenCalledTimes(1)

		unmount()

		const deferredRefresh = Promise.resolve({
			model: { model_id: MOCK_MODEL_BETA },
			extra: {
				transcription_enabled: false,
				auto_summary_enabled: true,
			},
		})
		vi.mocked(getRecordingTopicModel).mockReturnValueOnce(deferredRefresh)

		const reopened = renderHook(({ enabled }) => useRecordingSettings({ enabled }), {
			initialProps: { enabled: false },
		})

		reopened.rerender({ enabled: true })

		expect(reopened.result.current.isLoading).toBe(false)
		expect(reopened.result.current.isRefreshing).toBe(true)
		expect(reopened.result.current.settings?.model_id).toBe(MOCK_MODEL_ALPHA)

		await waitFor(() => {
			expect(reopened.result.current.settings?.model_id).toBe(MOCK_MODEL_BETA)
		})
		expect(reopened.result.current.isRefreshing).toBe(false)

		reopened.unmount()
	})

	it("keeps cached values visible when silent refresh fails", async () => {
		seedRecordingSettingsCacheForTests(
			{
				model: { model_id: MOCK_MODEL_ALPHA },
				extra: {
					transcription_enabled: true,
					auto_summary_enabled: false,
				},
			},
			{
				transcription_enabled: true,
				auto_summary_enabled: false,
				model_id: MOCK_MODEL_ALPHA,
			},
			mockModels,
			mockModelGroups,
		)
		vi.mocked(getRecordingTopicModel).mockRejectedValueOnce(new Error("refresh failed"))

		const { result } = renderHook(() => useRecordingSettings({ enabled: true }))

		expect(result.current.isLoading).toBe(false)
		expect(result.current.settings?.model_id).toBe(MOCK_MODEL_ALPHA)

		await waitFor(() => {
			expect(result.current.isRefreshing).toBe(false)
		})

		expect(result.current.settings?.model_id).toBe(MOCK_MODEL_ALPHA)
		expect(toast.error).toHaveBeenCalledWith("mobile.recordingEntry.settings.saveFailed")
	})
})
