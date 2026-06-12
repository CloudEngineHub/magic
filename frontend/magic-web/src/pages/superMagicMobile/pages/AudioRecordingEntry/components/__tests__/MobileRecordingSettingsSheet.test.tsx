import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ModelStatusEnum } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock(
	"@/pages/superMagic/components/MessageEditor/components/ModelSwitch/components/ModelListContent",
	() => ({
		ModelListContent: ({
			modelList,
			selectedModel,
			onModelClick,
		}: {
			modelList: Array<{ models?: Array<{ model_id: string; model_name: string }> }>
			selectedModel: { model_id: string } | null
			onModelClick: (model: { model_id: string }) => void
		}) => (
			<div data-testid="mock-model-list-content">
				{modelList.flatMap((group) =>
					(group.models ?? []).map((model) => (
						<button
							key={model.model_id}
							type="button"
							data-testid="model-switch-item"
							data-model-id={model.model_id}
							data-selected={model.model_id === selectedModel?.model_id}
							onClick={() => onModelClick(model)}
						>
							{model.model_name}
						</button>
					)),
				)}
			</div>
		),
	}),
)

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({
		children,
		visible,
		headerLeadingAction,
	}: {
		children: React.ReactNode
		visible: boolean
		headerLeadingAction?: { onClick: () => void; testId?: string }
	}) =>
		visible ? (
			<div data-testid="mock-magic-popup">
				{headerLeadingAction ? (
					<button
						type="button"
						data-testid={headerLeadingAction.testId}
						onClick={headerLeadingAction.onClick}
					>
						leading
					</button>
				) : null}
				{children}
			</div>
		) : null,
}))

const mockUpdateSetting = vi.fn()
const mockSettings = {
	transcription_enabled: true,
	auto_summary_enabled: false,
	model_id: "mock-model-alpha",
}

const mockSummaryModels = [
	{
		id: "mock-model-alpha",
		group_id: "mock-group-1",
		model_id: "mock-model-alpha",
		model_name: "Mock Alpha",
		provider_model_id: "mock-model-alpha",
		model_description: "",
		model_icon: "",
		sort: 1,
		model_status: ModelStatusEnum.Normal,
	},
	{
		id: "mock-model-beta",
		group_id: "mock-group-1",
		model_id: "mock-model-beta",
		model_name: "Mock Beta",
		provider_model_id: "mock-model-beta",
		model_description: "",
		model_icon: "",
		sort: 2,
		model_status: ModelStatusEnum.Normal,
	},
]

vi.mock("../../hooks/useMobileRecordingSettings", () => ({
	useMobileRecordingSettings: vi.fn(() => ({
		settings: mockSettings,
		summaryModels: mockSummaryModels,
		summaryModelGroups: [
			{
				group: {
					id: "mock-provider-group",
					mode_id: "mock-mode-1",
					icon: "",
					color: "",
					name: "Mock Provider",
					description: "",
					sort: 1,
					status: true,
					created_at: "",
				},
				models: mockSummaryModels,
				model_ids: ["mock-model-alpha", "mock-model-beta"],
				image_model_ids: [],
			},
		],
		selectedModel: {
			id: "mock-model-alpha",
			group_id: "mock-group-1",
			model_id: "mock-model-alpha",
			model_name: "Mock Alpha",
			provider_model_id: "mock-model-alpha",
			model_description: "",
			model_icon: "",
			sort: 1,
			model_status: ModelStatusEnum.Normal,
		},
		isLoading: false,
		isSaving: false,
		updateSetting: mockUpdateSetting,
	})),
}))

import { useMobileRecordingSettings } from "../../hooks/useMobileRecordingSettings"
import { MobileRecordingSettingsSheet } from "../MobileRecordingSettingsSheet"

describe("MobileRecordingSettingsSheet", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders spinner while settings are loading", () => {
		vi.mocked(useMobileRecordingSettings).mockReturnValueOnce({
			settings: null,
			summaryModels: [],
			summaryModelGroups: [],
			selectedModel: null,
			isLoading: true,
			isSaving: false,
			updateSetting: mockUpdateSetting,
		})

		render(<MobileRecordingSettingsSheet open onOpenChange={vi.fn()} />)

		const loadingContainer = screen.getByTestId("mobile-recording-settings-loading")
		expect(loadingContainer).toBeInTheDocument()
		expect(loadingContainer).toHaveAttribute("aria-busy", "true")
		expect(loadingContainer.querySelector('[role="status"]')).toBeInTheDocument()
		expect(screen.queryByText("loading")).toBeNull()
		expect(screen.queryByTestId("recording-setting-transcription-enabled")).toBeNull()
	})

	it("renders three settings rows without language options", () => {
		render(<MobileRecordingSettingsSheet open onOpenChange={vi.fn()} />)

		expect(screen.getByTestId("recording-setting-transcription-enabled")).toBeInTheDocument()
		expect(screen.getByTestId("recording-setting-auto-summary-enabled")).toBeInTheDocument()
		expect(screen.getByTestId("recording-setting-model-picker")).toBeInTheDocument()
		expect(screen.queryByTestId("recording-setting-transcript-language")).toBeNull()
		expect(screen.queryByTestId("recording-setting-summary-language")).toBeNull()
	})

	it("toggles switches via updateSetting", () => {
		render(<MobileRecordingSettingsSheet open onOpenChange={vi.fn()} />)

		fireEvent.click(screen.getByTestId("recording-setting-auto-summary-enabled"))
		expect(mockUpdateSetting).toHaveBeenCalledWith("auto_summary_enabled", true)
	})

	it("navigates to model subview and selects a model", async () => {
		render(<MobileRecordingSettingsSheet open onOpenChange={vi.fn()} />)

		fireEvent.click(screen.getByTestId("recording-setting-model-picker"))

		const betaModelItem = screen
			.getAllByTestId("model-switch-item")
			.find((item) => item.getAttribute("data-model-id") === "mock-model-beta")
		expect(betaModelItem).toBeTruthy()

		fireEvent.click(betaModelItem!)

		await waitFor(() => {
			expect(mockUpdateSetting).toHaveBeenCalledWith("model_id", "mock-model-beta")
		})
	})
})
