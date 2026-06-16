import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { forwardRef, useEffect, useImperativeHandle } from "react"
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
	mockMessageError,
	mockConfirmGenerate,
} = vi.hoisted(() => ({
	mockSaveDraft: vi.fn(),
	mockLoadDraft: vi.fn(),
	mockLoadBrandConfig: vi.fn(),
	mockListTemplates: vi.fn(),
	mockClearDraft: vi.fn(),
	mockSaveBrandConfig: vi.fn(),
	mockLoadTemplate: vi.fn(),
	mockDispose: vi.fn(),
	mockMessageError: vi.fn(),
	mockConfirmGenerate: vi.fn(),
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
	default: function MockStepConfirm({
		onFooterActionChange,
		onExecutionLockedChange,
	}: {
		onFooterActionChange?: (
			action: {
				label: string
				onClick: () => void
				disabled?: boolean
				disabledReason?: string
			} | null,
		) => void
		onExecutionLockedChange?: (locked: boolean) => void
	}) {
		useEffect(() => {
			onFooterActionChange?.({
				label: "开始 AI 创作（共 1 篇）",
				onClick: () => {
					onExecutionLockedChange?.(true)
					mockConfirmGenerate()
				},
				disabled: false,
			})
			return () => {
				onFooterActionChange?.(null)
				onExecutionLockedChange?.(false)
			}
		}, [onExecutionLockedChange, onFooterActionChange])

		return <div>confirm-step</div>
	},
}))

interface MockStepBrandInfoProps {
	onChange: (field: "author" | "brandPosition" | "targetAudience", value: string) => void
	onBrandImagesUploadingChange?: (uploading: boolean) => void
}

vi.mock("../components/SelfMediaInitPanel/steps/StepBrandInfo", () => ({
	default: forwardRef(function MockStepBrandInfo(props: MockStepBrandInfoProps, ref) {
		const { onBrandImagesUploadingChange, onChange } = props

		useImperativeHandle(ref, () => ({
			checkBeforeNext: () => {
				onChange("author", "Magic Lab")
				onChange("brandPosition", "AI tools")
				onBrandImagesUploadingChange?.(false)
				return true
			},
			isBrandAssetsReady: () => true,
		}))

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
		mockLoadBrandConfig.mockReset()
		mockListTemplates.mockReset()
		mockClearDraft.mockReset()
		mockSaveBrandConfig.mockReset()
		mockLoadTemplate.mockReset()
		mockDispose.mockReset()
		mockMessageError.mockReset()
		mockConfirmGenerate.mockReset()

		mockLoadDraft.mockResolvedValue(null)
		mockLoadBrandConfig.mockResolvedValue(null)
		mockListTemplates.mockResolvedValue([])
		mockSaveDraft.mockResolvedValue(undefined)
		mockSaveBrandConfig.mockResolvedValue(undefined)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("asks before restoring a detected draft", async () => {
		const deferred = createDeferred<{
			currentStep: number
			data: {
				global: {
					author: string
					brandPosition: string
					targetAudience: string
					brandImages: []
				}
				articles: Array<{ title: string; platform: string }>
			}
		}>()
		mockLoadDraft.mockReturnValueOnce(deferred.promise)

		render(
			<SelfMediaInitPanel
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="self-media"
				attachmentList={[]}
			/>,
		)

		expect(screen.getByTestId("self-media-init-panel-draft-loading")).toBeInTheDocument()
		expect(screen.getByText("detail.selfMedia.initPanel.draft.loading")).toBeInTheDocument()
		expect(screen.queryByText("brand-step")).not.toBeInTheDocument()
		expect(screen.queryByText("topics-step")).not.toBeInTheDocument()

		deferred.resolve({
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

		await waitFor(() => {
			expect(screen.getByTestId("self-media-draft-restore-dialog")).toBeInTheDocument()
		})

		const dialogBackdrop = screen.getByTestId("self-media-draft-restore-dialog").parentElement
		expect(screen.getByTestId("self-media-init-panel-root")).toHaveClass("relative")
		expect(dialogBackdrop).toHaveClass("absolute")
		expect(dialogBackdrop).not.toHaveClass("fixed")

		expect(screen.queryByTestId("self-media-init-panel-draft-loading")).not.toBeInTheDocument()
		expect(screen.getByText("brand-step")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("self-media-draft-restore-load-button"))

		await waitFor(() => {
			expect(screen.getByText("topics-step")).toBeInTheDocument()
		})
	})

	it("restores draft articles without overriding project brand config", async () => {
		mockLoadBrandConfig.mockResolvedValue({
			author: "Project Brand",
			brandPosition: "Project positioning",
			targetAudience: "Project audience",
			brandImages: [],
		})
		mockLoadDraft.mockResolvedValue({
			currentStep: 1,
			data: {
				global: {
					author: "Draft Brand",
					brandPosition: "Draft positioning",
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

		fireEvent.click(screen.getByTestId("self-media-init-panel-prev-button"))

		await waitFor(() => {
			expect(screen.getByText("brand-step")).toBeInTheDocument()
		})

		const nextButton = screen.getByText("detail.selfMedia.initPanel.nav.next").closest("button")
		expect(nextButton).not.toBeNull()
		if (!nextButton) throw new Error("next button not found")

		await act(async () => {
			fireEvent.click(nextButton)
		})

		await waitFor(() => {
			expect(mockSaveBrandConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					author: "Magic Lab",
					brandPosition: "AI tools",
				}),
			)
		})
		expect(mockSaveBrandConfig).not.toHaveBeenCalledWith(
			expect.objectContaining({
				author: "Draft Brand",
			}),
		)
	})

	it("navigates to the previous step before draft save resolves", async () => {
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
			expect(screen.getByTestId("self-media-draft-restore-dialog")).toBeInTheDocument()
		})

		fireEvent.click(screen.getByTestId("self-media-draft-restore-load-button"))

		await waitFor(() => {
			expect(screen.getByText("topics-step")).toBeInTheDocument()
		})

		fireEvent.click(screen.getByTestId("self-media-init-panel-prev-button"))

		expect(await screen.findByText("brand-step")).toBeInTheDocument()
		expect(mockSaveDraft).toHaveBeenCalledTimes(1)
		expect(mockSaveDraft).toHaveBeenCalledWith(
			expect.objectContaining({
				global: expect.objectContaining({ author: "Magic Lab" }),
			}),
			0,
		)

		await act(async () => {
			deferred.resolve()
			await deferred.promise
		})
	})

	it("navigates to the next step before draft save resolves", async () => {
		render(
			<SelfMediaInitPanel
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="self-media"
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			const nextButton = screen
				.getByText("detail.selfMedia.initPanel.nav.next")
				.closest("button")
			expect(nextButton).not.toBeNull()
			expect(nextButton).not.toBeDisabled()
		})
		expect(screen.getByTestId("self-media-init-panel-shell")).toHaveClass("grid-cols-1")
		expect(screen.queryByTestId("self-media-init-panel-proceed-hint")).not.toBeInTheDocument()
		expect(screen.getByLabelText("detail.selfMedia.initPanel.nav.nextWithHint")).toBeEnabled()

		const nextButton = screen.getByText("detail.selfMedia.initPanel.nav.next").closest("button")
		expect(nextButton).not.toBeNull()
		if (!nextButton) throw new Error("next button not found")
		await act(async () => {
			fireEvent.click(nextButton)
		})

		expect(await screen.findByText("topics-step")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-init-panel-proceed-hint")).toHaveTextContent(
			"detail.selfMedia.initPanel.nav.hints.noArticle",
		)
		const disabledNextButton = screen
			.getByText("detail.selfMedia.initPanel.nav.next")
			.closest("button")
		expect(disabledNextButton).toBeDisabled()
		expect(mockSaveDraft).not.toHaveBeenCalled()
	})

	it("uses the shared footer for the final AI creation action", async () => {
		mockLoadDraft.mockResolvedValue({
			currentStep: 2,
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
				onBackHome={vi.fn()}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("self-media-draft-restore-dialog")).toBeInTheDocument()
		})

		fireEvent.click(screen.getByTestId("self-media-draft-restore-load-button"))

		await waitFor(() => {
			expect(screen.getByText("confirm-step")).toBeInTheDocument()
		})

		expect(
			screen.queryByTestId("self-media-init-panel-back-home-button"),
		).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-init-panel-clear-button")).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: /开始 AI 创作/ }))

		expect(mockConfirmGenerate).toHaveBeenCalledTimes(1)
	})

	it("hides the footer once final creation enters execution", async () => {
		mockLoadDraft.mockResolvedValue({
			currentStep: 2,
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
				onBackHome={vi.fn()}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("self-media-draft-restore-dialog")).toBeInTheDocument()
		})

		fireEvent.click(screen.getByTestId("self-media-draft-restore-load-button"))

		await waitFor(() => {
			expect(screen.getByText("confirm-step")).toBeInTheDocument()
		})
		expect(screen.getByTestId("self-media-init-panel-footer")).toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: /开始 AI 创作/ }))

		expect(screen.queryByTestId("self-media-init-panel-footer")).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-init-panel-prev-button")).not.toBeInTheDocument()
		expect(mockConfirmGenerate).toHaveBeenCalledTimes(1)
	})

	it("shows a restore prompt when a draft exists", async () => {
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
		mockListTemplates.mockResolvedValue([
			{
				id: "template-1",
				name: "Template A",
				articleCount: 1,
				createdAt: "2026-05-20T00:00:00.000Z",
			},
		])

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

		expect(screen.getByText("detail.selfMedia.initPanel.draft.detected")).toBeInTheDocument()
		expect(screen.getByText("brand-step")).toBeInTheDocument()
		expect(screen.queryByText("topics-step")).not.toBeInTheDocument()
		expect(
			screen.queryByText("detail.selfMedia.initPanel.template.selectTitle"),
		).not.toBeInTheDocument()
	})

	it("does not show a restore prompt for an empty article shell draft", async () => {
		mockLoadDraft.mockResolvedValue({
			currentStep: 0,
			data: {
				global: {
					author: "Magic Lab",
					brandPosition: "AI tools",
					targetAudience: "Creators",
					brandImages: [],
				},
				articles: [
					{
						title: "",
						folderName: "",
						style: "professional",
						cardCount: 6,
						outline: Array.from({ length: 6 }).map((_, index) => ({
							id: `empty-node-${index + 1}`,
							text: "",
							children: [],
						})),
						materials: [],
						notes: "",
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
			expect(screen.getByText("brand-step")).toBeInTheDocument()
		})

		expect(screen.queryByTestId("self-media-draft-restore-dialog")).not.toBeInTheDocument()
		expect(mockClearDraft).not.toHaveBeenCalled()
	})

	it("clears a detected draft from the restore prompt", async () => {
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

		fireEvent.click(screen.getByTestId("self-media-draft-restore-clear-button"))

		await waitFor(() => {
			expect(mockClearDraft).toHaveBeenCalledTimes(1)
			expect(screen.queryByTestId("self-media-draft-restore-dialog")).not.toBeInTheDocument()
		})
		expect(screen.getByText("brand-step")).toBeInTheDocument()
	})

	it("returns home from the restore prompt", async () => {
		const onBackHome = vi.fn()
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

		fireEvent.click(screen.getByTestId("self-media-draft-restore-back-button"))

		expect(onBackHome).toHaveBeenCalledTimes(1)
	})

	it("returns home from the footer action", async () => {
		const onBackHome = vi.fn()

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
			expect(screen.getByText("brand-step")).toBeInTheDocument()
		})

		fireEvent.click(screen.getByTestId("self-media-init-panel-back-home-button"))

		expect(onBackHome).toHaveBeenCalledTimes(1)
	})

	it("clears all data, deletes draft, and returns to the first step", async () => {
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

		fireEvent.click(screen.getByTestId("self-media-clear-confirm-confirm"))

		await waitFor(() => {
			expect(screen.getByText("brand-step")).toBeInTheDocument()
		})

		expect(screen.queryByText("topics-step")).not.toBeInTheDocument()
		expect(mockClearDraft).toHaveBeenCalledTimes(1)
	})

	it("keeps the top progress preview and footer fixed while middle content owns scrolling", async () => {
		render(
			<SelfMediaInitPanel
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="self-media"
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByText("brand-step")).toBeInTheDocument()
		})

		const root = screen.getByTestId("self-media-init-panel-root")
		const shell = screen.getByTestId("self-media-init-panel-shell")
		const header = screen.getByTestId("self-media-init-panel-header")
		const content = screen.getByTestId("self-media-init-panel-content")
		const footer = screen.getByTestId("self-media-init-panel-footer")

		expect(root.className).toContain("overflow-hidden")
		expect(shell.className).toContain("grid-rows-[auto_minmax(0,1fr)_auto]")
		expect(header.className).toContain("shrink-0")
		expect(content.className).toContain("min-h-0")
		expect(content.className).toContain("overflow-y-auto")
		expect(footer.className).toContain("shrink-0")
	})

	it("compacts the top preview while the content viewport is scrolled", async () => {
		render(
			<SelfMediaInitPanel
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="self-media"
				attachmentList={[]}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByText("brand-step")).toBeInTheDocument()
		})

		const content = screen.getByTestId("self-media-init-panel-content")
		const viewport = content.querySelector('[data-slot="scroll-area-viewport"]')
		expect(viewport).toBeInstanceOf(HTMLDivElement)
		if (!(viewport instanceof HTMLDivElement)) {
			throw new Error("content viewport not found")
		}

		expect(screen.getByTestId("self-media-init-panel-header")).not.toHaveAttribute(
			"data-compact",
		)
		expect(screen.getByTestId("self-media-step-brand-orbit")).toBeInTheDocument()

		viewport.scrollTop = 80
		fireEvent.scroll(viewport)

		await waitFor(() => {
			expect(screen.getByTestId("self-media-init-panel-header")).toHaveAttribute(
				"data-compact",
				"true",
			)
		})
		expect(screen.queryByTestId("self-media-step-brand-orbit")).not.toBeInTheDocument()

		viewport.scrollTop = 0
		fireEvent.scroll(viewport)

		await waitFor(() => {
			expect(screen.getByTestId("self-media-init-panel-header")).not.toHaveAttribute(
				"data-compact",
			)
		})
		expect(screen.getByTestId("self-media-step-brand-orbit")).toBeInTheDocument()
	})

	it("shows an error toast when background draft save fails", async () => {
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
		mockSaveDraft.mockRejectedValueOnce(new Error("save failed"))
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

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
		fireEvent.click(screen.getByTestId("self-media-init-panel-prev-button"))

		await waitFor(() => {
			expect(screen.getByText("brand-step")).toBeInTheDocument()
			expect(mockMessageError).toHaveBeenCalledWith(
				"detail.selfMedia.initPanel.draft.saveError",
			)
		})

		consoleErrorSpy.mockRestore()
	})
})
