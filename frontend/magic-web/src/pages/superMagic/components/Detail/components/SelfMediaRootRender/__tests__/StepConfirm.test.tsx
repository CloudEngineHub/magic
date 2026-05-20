import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SelfMediaInitData } from "../components/SelfMediaInitPanel/types"

const { mockSendArticleBatch, mockNavigateToBatchTopic, mockFetchTopics } = vi.hoisted(() => ({
	mockSendArticleBatch: vi.fn(),
	mockNavigateToBatchTopic: vi.fn(),
	mockFetchTopics: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock(
	"../services/selfMediaBatchSend",
	() => ({
		sendArticleBatch: mockSendArticleBatch,
		navigateToBatchTopic: mockNavigateToBatchTopic,
	}),
)

vi.mock("@/pages/superMagic/services", () => ({
	default: {
		topic: {
			fetchTopics: mockFetchTopics,
		},
	},
}))

import StepConfirm from "../components/SelfMediaInitPanel/StepConfirm"

const data: SelfMediaInitData = {
	global: {
		author: "Magic Lab",
		brandPosition: "AI tools",
		targetAudience: "Creators",
		brandImages: [],
	},
	articles: [
		{
			title: "Post A",
			folderName: "post-a",
			style: "professional",
			visualPreset: "code-dispatch",
			cardCount: 6,
			outline: [],
			materials: [],
			notes: "",
			platform: "rednote",
			description: "desc",
			visualReferenceFiles: [],
		},
	],
}

describe("StepConfirm", () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		mockSendArticleBatch.mockReset()
		mockNavigateToBatchTopic.mockReset()
		mockFetchTopics.mockReset()
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
	})

	afterEach(() => {
		consoleErrorSpy.mockRestore()
	})

	it("stops generation when archiving draft fails", async () => {
		const onArchiveDraft = vi.fn().mockRejectedValue(new Error("archive failed"))
		const onGenerateFailed = vi.fn()
		mockSendArticleBatch.mockResolvedValue([])

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onArchiveDraft={onArchiveDraft}
				onGenerateFailed={onGenerateFailed}
			/>,
		)

		fireEvent.click(screen.getByText("detail.selfMedia.initPanel.stepConfirm.startBtn"))

		await waitFor(() => {
			expect(onArchiveDraft).toHaveBeenCalledTimes(1)
			expect(mockSendArticleBatch).not.toHaveBeenCalled()
			expect(onGenerateFailed).toHaveBeenCalledTimes(1)
		})
	})

	it("restores caller state when batch sending fails after archiving", async () => {
		const onArchiveDraft = vi.fn().mockResolvedValue(undefined)
		const onGenerateFailed = vi.fn()
		mockSendArticleBatch.mockRejectedValue(new Error("send failed"))

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onArchiveDraft={onArchiveDraft}
				onGenerateFailed={onGenerateFailed}
			/>,
		)

		fireEvent.click(screen.getByText("detail.selfMedia.initPanel.stepConfirm.startBtn"))

		await waitFor(() => {
			expect(onArchiveDraft).toHaveBeenCalledTimes(1)
			expect(mockSendArticleBatch).toHaveBeenCalledTimes(1)
			expect(onGenerateFailed).toHaveBeenCalledTimes(1)
		})
	})
})
