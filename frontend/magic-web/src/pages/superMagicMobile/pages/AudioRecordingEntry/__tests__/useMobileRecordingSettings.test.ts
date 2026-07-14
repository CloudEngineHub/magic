import { renderHook, waitFor } from "@testing-library/react"
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

vi.mock("@/pages/superMagic/pages/AudioRecordings/apis/recording-settings-api", () => ({
	getRecordingTopicModel: vi.fn(),
	saveRecordingTopicModel: vi.fn(),
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/utils/summary-model-list", () => ({
	fetchSummaryModelGroups: vi.fn(),
	resolveDefaultSummaryModelId: vi.fn(),
	resolveValidSummaryModelId: vi.fn(),
}))

import {
	getRecordingTopicModel,
	saveRecordingTopicModel,
} from "@/pages/superMagic/pages/AudioRecordings/apis/recording-settings-api"
import {
	fetchSummaryModelGroups,
	resolveDefaultSummaryModelId,
	resolveValidSummaryModelId,
} from "@/pages/superMagic/pages/AudioRecordings/utils/summary-model-list"
import {
	resetMobileRecordingSettingsCacheForTests,
	useMobileRecordingSettings,
} from "../hooks/useMobileRecordingSettings"

const MOCK_MODEL_ALPHA = "mock-model-alpha"

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
		model_ids: [MOCK_MODEL_ALPHA],
		image_model_ids: [],
	},
]

describe("useMobileRecordingSettings-proxy", () => {
	beforeEach(() => {
		resetMobileRecordingSettingsCacheForTests()
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

	it("loads settings and exposes them via proxy Hook", async () => {
		const { result } = renderHook(() => useMobileRecordingSettings({ enabled: true }))

		expect(result.current.isLoading).toBe(true)

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})

		expect(result.current.settings?.model_id).toBe(MOCK_MODEL_ALPHA)
	})
})
