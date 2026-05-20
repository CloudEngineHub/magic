import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { forwardRef, useEffect, useImperativeHandle } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
	mockSaveDraft,
	mockLoadDraft,
	mockListTemplates,
	mockClearDraft,
	mockLoadTemplate,
	mockDispose,
	mockMessageError,
} = vi.hoisted(() => ({
	mockSaveDraft: vi.fn(),
	mockLoadDraft: vi.fn(),
	mockListTemplates: vi.fn(),
	mockClearDraft: vi.fn(),
	mockLoadTemplate: vi.fn(),
	mockDispose: vi.fn(),
	mockMessageError: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("mobx-react-lite", () => ({
	observer: (component: unknown) => component,
}))

vi.mock("antd", () => ({
	message: {
		error: mockMessageError,
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
		listTemplates: mockListTemplates,
		clearDraft: mockClearDraft,
		loadTemplate: mockLoadTemplate,
		dispose: mockDispose,
	})),
}))

vi.mock("../components/SelfMediaInitPanel/StepTopicList", () => ({
	default: function MockStepTopicList() {
		return <div>topics-step</div>
	},
}))

vi.mock("../components/SelfMediaInitPanel/StepArticleDetail", () => ({
	default: function MockStepArticleDetail() {
		return <div>detail-step</div>
	},
}))

vi.mock("../components/SelfMediaInitPanel/StepConfirm", () => ({
	default: function MockStepConfirm() {
		return <div>confirm-step</div>
	},
}))

vi.mock("../components/SelfMediaInitPanel/StepBrandInfo", () => ({
	default: forwardRef(function MockStepBrandInfo(props: any, ref) {
		useImperativeHandle(ref, () => ({
			checkBeforeNext: () => true,
			isBrandAssetsReady: () => true,
		}))

		useEffect(() => {
			props.onChange("author", "Magic Lab")
			props.onChange("brandPosition", "AI tools")
			props.onBrandImagesUploadingChange?.(false)
		}, [])

		return <div>brand-step</div>
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

describe("SelfMediaInitPanel", () => {
	beforeEach(() => {
		mockSaveDraft.mockReset()
		mockLoadDraft.mockReset()
		mockListTemplates.mockReset()
		mockClearDraft.mockReset()
		mockLoadTemplate.mockReset()
		mockDispose.mockReset()
		mockMessageError.mockReset()

		mockLoadDraft.mockResolvedValue(null)
		mockListTemplates.mockResolvedValue([])
		mockSaveDraft.mockResolvedValue(undefined)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("navigates to the next step before draft save resolves", async () => {
		const deferred = createDeferred<void>()
		mockSaveDraft.mockReturnValueOnce(deferred.promise)

		render(
			<SelfMediaInitPanel
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="self-media"
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByText("detail.selfMedia.initPanel.nav.next")).not.toBeDisabled()
		})

		fireEvent.click(screen.getByText("detail.selfMedia.initPanel.nav.next"))

		expect(screen.getByText("topics-step")).toBeInTheDocument()
		expect(mockSaveDraft).toHaveBeenCalledTimes(1)

		deferred.resolve()
	})

	it("shows an error toast when background draft save fails", async () => {
		mockSaveDraft.mockRejectedValueOnce(new Error("save failed"))
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		render(
			<SelfMediaInitPanel
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="self-media"
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByText("detail.selfMedia.initPanel.nav.next")).not.toBeDisabled()
		})

		fireEvent.click(screen.getByText("detail.selfMedia.initPanel.nav.next"))

		await waitFor(() => {
			expect(screen.getByText("topics-step")).toBeInTheDocument()
			expect(mockMessageError).toHaveBeenCalledWith(
				"detail.selfMedia.initPanel.draft.saveError",
			)
		})

		consoleErrorSpy.mockRestore()
	})
})
