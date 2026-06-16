import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { forwardRef, useImperativeHandle } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
	mockSaveDraft,
	mockLoadDraft,
	mockLoadBrandConfig,
	mockListTemplates,
	mockClearDraft,
	mockSaveBrandConfig,
	mockLoadTemplate,
	mockDispose,
} = vi.hoisted(() => ({
	mockSaveDraft: vi.fn(),
	mockLoadDraft: vi.fn(),
	mockLoadBrandConfig: vi.fn(),
	mockListTemplates: vi.fn(),
	mockClearDraft: vi.fn(),
	mockSaveBrandConfig: vi.fn(),
	mockLoadTemplate: vi.fn(),
	mockDispose: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
}))

vi.mock("mobx-react-lite", () => ({
	observer: (component: unknown) => component,
}))

vi.mock("antd", () => ({
	message: {
		error: vi.fn(),
		warning: vi.fn(),
	},
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			userInfo: {
				user_id: "user-1",
			},
			organizationCode: "org-1",
		},
	},
}))

vi.mock("@/services/selfMedia", () => ({
	SelfMediaBrandRecordService: vi.fn().mockImplementation(() => ({
		listRecords: vi.fn().mockResolvedValue([]),
	})),
}))

vi.mock("../services/SelfMediaFileStorageService", () => ({
	SelfMediaFileStorageService: vi.fn().mockImplementation(() => ({
		saveDraft: mockSaveDraft,
		loadDraft: mockLoadDraft,
		loadBrandConfig: mockLoadBrandConfig,
		saveBrandConfig: mockSaveBrandConfig,
		listTemplates: mockListTemplates,
		clearDraft: mockClearDraft,
		loadTemplate: mockLoadTemplate,
		dispose: mockDispose,
	})),
}))

vi.mock("../components/SelfMediaInitPanel/steps/StepTopicAndDetail", () => ({
	default: function MockStepTopicAndDetail() {
		return <div>topics-step</div>
	},
}))

vi.mock("../components/SelfMediaInitPanel/steps/StepConfirm", () => ({
	default: function MockStepConfirm() {
		return <div>confirm-step</div>
	},
}))

interface MockStepBrandInfoProps {
	onChange: (field: "author" | "brandPosition" | "targetAudience", value: string) => void
}

vi.mock("../components/SelfMediaInitPanel/steps/StepBrandInfo", () => ({
	default: forwardRef(function MockStepBrandInfo(props: MockStepBrandInfoProps, ref) {
		const { onChange } = props

		useImperativeHandle(ref, () => ({
			checkBeforeNext: () => true,
			isBrandAssetsReady: () => true,
		}))

		return (
			<button
				type="button"
				data-testid="edit-brand-info"
				onClick={() => {
					onChange("author", "Magic Lab")
					onChange("brandPosition", "AI tools")
				}}
			>
				edit brand info
			</button>
		)
	}),
}))

import SelfMediaInitPanel from "../components/SelfMediaInitPanel"

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((res) => {
		resolve = res
	})

	return {
		promise,
		resolve,
	}
}

describe("SelfMediaInitPanel clear confirmation", () => {
	beforeEach(() => {
		mockSaveDraft.mockReset()
		mockLoadDraft.mockReset()
		mockLoadBrandConfig.mockReset()
		mockListTemplates.mockReset()
		mockClearDraft.mockReset()
		mockSaveBrandConfig.mockReset()
		mockLoadTemplate.mockReset()
		mockDispose.mockReset()

		mockLoadDraft.mockResolvedValue(null)
		mockLoadBrandConfig.mockResolvedValue(null)
		mockListTemplates.mockResolvedValue([])
		mockSaveDraft.mockResolvedValue(undefined)
		mockSaveBrandConfig.mockResolvedValue(undefined)
		mockClearDraft.mockResolvedValue(undefined)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("asks for confirmation before clearing in-progress data from the footer", async () => {
		mockLoadDraft.mockResolvedValue({
			currentStep: 1,
			data: {
				global: {
					author: "Magic Lab",
					brandPosition: "AI tools",
					targetAudience: "",
					brandImages: [],
				},
				articles: [
					{
						title: "Draft article",
						platform: "rednote",
					},
				],
			},
		})

		render(
			<SelfMediaInitPanel
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="self-media"
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("self-media-draft-restore-dialog")).toBeInTheDocument()
		})

		fireEvent.click(screen.getByTestId("self-media-draft-restore-load-button"))

		await waitFor(() => {
			expect(screen.getByText("topics-step")).toBeInTheDocument()
		})

		fireEvent.click(screen.getByTestId("self-media-init-panel-clear-button"))

		expect(mockClearDraft).not.toHaveBeenCalled()
		expect(screen.getByTestId("self-media-clear-confirm-dialog")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-clear-confirm-cancel")).toHaveFocus()

		fireEvent.keyDown(screen.getByTestId("self-media-clear-confirm-overlay"), {
			key: "Escape",
		})

		expect(screen.queryByTestId("self-media-clear-confirm-dialog")).not.toBeInTheDocument()
		expect(mockClearDraft).not.toHaveBeenCalled()

		fireEvent.click(screen.getByTestId("self-media-init-panel-clear-button"))
		expect(screen.getByTestId("self-media-clear-confirm-dialog")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("self-media-clear-confirm-overlay"))

		expect(screen.queryByTestId("self-media-clear-confirm-dialog")).not.toBeInTheDocument()
		expect(mockClearDraft).not.toHaveBeenCalled()

		fireEvent.click(screen.getByTestId("self-media-init-panel-clear-button"))

		fireEvent.click(screen.getByTestId("self-media-clear-confirm-cancel"))

		expect(screen.queryByTestId("self-media-clear-confirm-dialog")).not.toBeInTheDocument()
		expect(mockClearDraft).not.toHaveBeenCalled()

		fireEvent.click(screen.getByTestId("self-media-init-panel-clear-button"))
		fireEvent.click(screen.getByTestId("self-media-clear-confirm-confirm"))

		await waitFor(() => {
			expect(mockClearDraft).toHaveBeenCalledTimes(1)
		})
		expect(screen.queryByTestId("self-media-clear-confirm-dialog")).not.toBeInTheDocument()
	})

	it("keeps the confirm action in progress and prevents duplicate clears", async () => {
		const deferred = createDeferred<void>()
		mockClearDraft.mockReturnValue(deferred.promise)

		mockLoadDraft.mockResolvedValue({
			currentStep: 1,
			data: {
				global: {
					author: "Magic Lab",
					brandPosition: "AI tools",
					targetAudience: "",
					brandImages: [],
				},
				articles: [
					{
						title: "Draft article",
						platform: "rednote",
					},
				],
			},
		})

		render(
			<SelfMediaInitPanel
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="self-media"
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("self-media-draft-restore-dialog")).toBeInTheDocument()
		})

		fireEvent.click(screen.getByTestId("self-media-draft-restore-load-button"))

		await waitFor(() => {
			expect(screen.getByText("topics-step")).toBeInTheDocument()
		})

		fireEvent.click(screen.getByTestId("self-media-init-panel-clear-button"))

		const confirmButton = screen.getByTestId("self-media-clear-confirm-confirm")
		fireEvent.click(confirmButton)
		fireEvent.click(confirmButton)

		expect(confirmButton).toBeDisabled()
		expect(confirmButton).toHaveTextContent("detail.selfMedia.initPanel.clearConfirm.clearing")
		expect(mockClearDraft).toHaveBeenCalledTimes(1)

		fireEvent.keyDown(screen.getByTestId("self-media-clear-confirm-overlay"), {
			key: "Escape",
		})
		fireEvent.click(screen.getByTestId("self-media-clear-confirm-overlay"))

		expect(screen.getByTestId("self-media-clear-confirm-dialog")).toBeInTheDocument()

		deferred.resolve()

		await waitFor(() => {
			expect(screen.queryByTestId("self-media-clear-confirm-dialog")).not.toBeInTheDocument()
		})
	})
})
