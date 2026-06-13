import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
	brandAutoSaveStatus?: string
	onChange: (field: "author" | "brandPosition" | "targetAudience", value: string) => void
	onBrandImagesUploadingChange?: (uploading: boolean) => void
}

vi.mock("../components/SelfMediaInitPanel/steps/StepBrandInfo", () => ({
	default: forwardRef(function MockStepBrandInfo(props: MockStepBrandInfoProps, ref) {
		const { brandAutoSaveStatus = "idle", onBrandImagesUploadingChange, onChange } = props

		useImperativeHandle(ref, () => ({
			checkBeforeNext: () => true,
			isBrandAssetsReady: () => true,
		}))

		return (
			<div>
				<div data-testid="brand-auto-save-status">{brandAutoSaveStatus}</div>
				<button
					type="button"
					data-testid="edit-brand-info"
					onClick={() => {
						onChange("author", "Magic Lab")
						onBrandImagesUploadingChange?.(false)
					}}
				>
					edit brand info
				</button>
			</div>
		)
	}),
}))

import SelfMediaInitPanel from "../components/SelfMediaInitPanel"

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void

	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})

	return {
		promise,
		resolve,
		reject,
	}
}

describe("SelfMediaInitPanel brand auto-save feedback", () => {
	beforeEach(() => {
		vi.useRealTimers()
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
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.clearAllMocks()
	})

	it("shows pending feedback immediately after brand information changes", async () => {
		render(
			<SelfMediaInitPanel
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="self-media"
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("edit-brand-info")).toBeInTheDocument()
		})

		fireEvent.click(screen.getByTestId("edit-brand-info"))

		expect(screen.getByTestId("brand-auto-save-status")).toHaveTextContent("pending")
		expect(mockSaveBrandConfig).not.toHaveBeenCalled()
	})

	it("moves brand auto-save feedback from saving to saved when autosave runs", async () => {
		const saveDeferred = createDeferred<void>()
		mockSaveBrandConfig.mockReturnValueOnce(saveDeferred.promise)

		render(
			<SelfMediaInitPanel
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="self-media"
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("edit-brand-info")).toBeInTheDocument()
		})

		vi.useFakeTimers()
		fireEvent.click(screen.getByTestId("edit-brand-info"))

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000)
			await Promise.resolve()
		})

		expect(mockSaveBrandConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				author: "Magic Lab",
			}),
		)
		expect(screen.getByTestId("brand-auto-save-status")).toHaveTextContent("saving")

		await act(async () => {
			saveDeferred.resolve()
			await saveDeferred.promise
			await Promise.resolve()
		})

		expect(screen.getByTestId("brand-auto-save-status")).toHaveTextContent("saved")
	})

	it("keeps failed brand changes dirty so navigation can retry the save", async () => {
		mockSaveBrandConfig
			.mockRejectedValueOnce(new Error("save failed"))
			.mockResolvedValueOnce(undefined)

		render(
			<SelfMediaInitPanel
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="self-media"
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("edit-brand-info")).toBeInTheDocument()
		})

		vi.useFakeTimers()
		fireEvent.click(screen.getByTestId("edit-brand-info"))

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000)
			await Promise.resolve()
		})

		expect(screen.getByTestId("brand-auto-save-status")).toHaveTextContent("failed")
		expect(mockSaveBrandConfig).toHaveBeenCalledTimes(1)

		const nextButton = screen.getByText("detail.selfMedia.initPanel.nav.next").closest("button")
		if (!nextButton) throw new Error("next button not found")
		await act(async () => {
			fireEvent.click(nextButton)
			await Promise.resolve()
		})

		expect(mockSaveBrandConfig).toHaveBeenCalledTimes(2)
		expect(mockSaveBrandConfig).toHaveBeenLastCalledWith(
			expect.objectContaining({
				author: "Magic Lab",
			}),
		)
	})
})
