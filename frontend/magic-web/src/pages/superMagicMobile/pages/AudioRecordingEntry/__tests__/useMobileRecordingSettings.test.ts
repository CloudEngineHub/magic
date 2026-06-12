import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ModelStatusEnum } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
	},
}))

vi.mock("../apis/recording-settings-api", () => ({
	getRecordingTopicModel: vi.fn(),
	saveRecordingTopicModel: vi.fn(),
}))

vi.mock("../utils/summary-model-list", () => ({
	fetchSummaryModelGroups: vi.fn(),
	resolveDefaultSummaryModelId: vi.fn(),
	resolveValidSummaryModelId: vi.fn(),
}))

import { getRecordingTopicModel, saveRecordingTopicModel } from "../apis/recording-settings-api"
import {
	fetchSummaryModelGroups,
	resolveDefaultSummaryModelId,
	resolveValidSummaryModelId,
} from "../utils/summary-model-list"
import {
	resetMobileRecordingSettingsCacheForTests,
	seedMobileRecordingSettingsCacheForTests,
	useMobileRecordingSettings,
} from "../hooks/useMobileRecordingSettings"

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

describe("useMobileRecordingSettings", () => {
	beforeEach(() => {
		resetMobileRecordingSettingsCacheForTests()
		vi.clearAllMocks()
		vi.mocked(fetchSummaryModelGroups).mockResolvedValue([
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
		])
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
		seedMobileRecordingSettingsCacheForTests(
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
		)

		const { result } = renderHook(() => useMobileRecordingSettings({ enabled: false }))

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

		const { result } = renderHook(() => useMobileRecordingSettings({ enabled: true }))

		await waitFor(() => {
			expect(result.current.settings?.model_id).toBe(MOCK_MODEL_BETA)
		})

		expect(saveRecordingTopicModel).toHaveBeenCalledWith(
			expect.objectContaining({
				model_id: MOCK_MODEL_BETA,
			}),
		)
	})
})
