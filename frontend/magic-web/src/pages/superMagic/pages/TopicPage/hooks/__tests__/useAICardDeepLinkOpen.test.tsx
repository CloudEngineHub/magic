import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { useAICardDeepLinkOpen } from "../useAICardDeepLinkOpen"

vi.mock("@/routes/history/helpers", () => ({
	getRoutePath: vi.fn(),
}))

vi.mock("@/utils/env", () => ({
	env: vi.fn(),
}))

function createWrapper(initialEntry: string) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return (
			<MemoryRouter
				initialEntries={[initialEntry]}
				future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
			>
				{children}
			</MemoryRouter>
		)
	}
}

describe("useAICardDeepLinkOpen", () => {
	it("opens the matched AI card folder from the ai_card query parameter", () => {
		const scheduleWhenTabsCacheReady = vi.fn((callback: () => void) => callback())
		const handleFileClickWithPanel = vi.fn()
		const clearUserSelectDetail = vi.fn()

		renderHook(
			() =>
				useAICardDeepLinkOpen({
					topicId: "topic-1",
					attachments: [
						{
							file_id: "folder-1",
							is_directory: true,
							display_config: {
								type: "ai-card",
								card_id: "card-123",
							},
						},
					],
					scheduleWhenTabsCacheReady,
					handleFileClickWithPanel,
					clearUserSelectDetail,
				}),
			{ wrapper: createWrapper("/super/project-1/topic-1?ai_card=card-123") },
		)

		expect(clearUserSelectDetail).toHaveBeenCalledTimes(1)
		expect(scheduleWhenTabsCacheReady).toHaveBeenCalledTimes(1)
		expect(handleFileClickWithPanel).toHaveBeenCalledWith(
			expect.objectContaining({
				file_id: "folder-1",
				initialNavigation: {
					activeCardId: "folder-1",
					initialView: "detail",
				},
			}),
		)
	})

	it("does not open the same AI card deep link more than once for the same topic", () => {
		const scheduleWhenTabsCacheReady = vi.fn((callback: () => void) => callback())
		const handleFileClickWithPanel = vi.fn()
		const clearUserSelectDetail = vi.fn()
		const attachments = [
			{
				file_id: "folder-1",
				is_directory: true,
				display_config: {
					type: "ai-card",
					card_id: "card-123",
				},
			},
		]

		const { rerender } = renderHook(
			() =>
				useAICardDeepLinkOpen({
					topicId: "topic-1",
					attachments,
					scheduleWhenTabsCacheReady,
					handleFileClickWithPanel,
					clearUserSelectDetail,
				}),
			{ wrapper: createWrapper("/super/project-1/topic-1?ai_card=card-123") },
		)

		rerender()

		expect(clearUserSelectDetail).toHaveBeenCalledTimes(1)
		expect(scheduleWhenTabsCacheReady).toHaveBeenCalledTimes(1)
		expect(handleFileClickWithPanel).toHaveBeenCalledTimes(1)
	})
})
