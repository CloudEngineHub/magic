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

vi.mock("../components/SelfMediaInitPanel/steps/StepBrandInfo", () => ({
	default: forwardRef(function MockStepBrandInfo(_, ref) {
		useImperativeHandle(ref, () => ({
			checkBeforeNext: () => true,
			isBrandAssetsReady: () => true,
		}))

		return <div>brand-step</div>
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

describe("SelfMediaInitPanel draft restore actions", () => {
	beforeEach(() => {
		mockSaveDraft.mockReset()
		mockLoadDraft.mockReset()
		mockLoadBrandConfig.mockReset()
		mockListTemplates.mockReset()
		mockClearDraft.mockReset()
		mockSaveBrandConfig.mockReset()
		mockLoadTemplate.mockReset()
		mockDispose.mockReset()

		mockLoadBrandConfig.mockResolvedValue(null)
		mockListTemplates.mockResolvedValue([])
		mockSaveDraft.mockResolvedValue(undefined)
		mockSaveBrandConfig.mockResolvedValue(undefined)
		mockClearDraft.mockResolvedValue(undefined)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("keeps draft discard in progress and prevents duplicate clears", async () => {
		const deferred = createDeferred<void>()
		const onBackHome = vi.fn()
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
				onBackHome={onBackHome}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("self-media-draft-restore-dialog")).toBeInTheDocument()
		})
		expect(screen.getByTestId("self-media-draft-restore-load-button")).toHaveFocus()

		const discardButton = screen.getByTestId("self-media-draft-restore-clear-button")
		fireEvent.click(discardButton)
		fireEvent.click(discardButton)

		expect(discardButton).toBeDisabled()
		expect(discardButton).toHaveTextContent("detail.selfMedia.initPanel.draft.clearing")
		expect(screen.getByTestId("self-media-draft-restore-load-button")).toBeDisabled()
		expect(screen.getByTestId("self-media-draft-restore-back-button")).toBeDisabled()
		expect(mockClearDraft).toHaveBeenCalledTimes(1)

		deferred.resolve()

		await waitFor(() => {
			expect(screen.queryByTestId("self-media-draft-restore-dialog")).not.toBeInTheDocument()
		})
	})
})
