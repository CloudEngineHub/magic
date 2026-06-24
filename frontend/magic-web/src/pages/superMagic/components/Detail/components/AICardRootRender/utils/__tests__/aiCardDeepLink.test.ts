import { describe, expect, it, vi } from "vitest"
import {
	AI_CARD_DEEP_LINK_QUERY_PARAM,
	createAICardId,
	generateAICardDeepLink,
	resolveAICardDeepLinkTarget,
} from "../aiCardDeepLink"
import { getRoutePath } from "@/routes/history/helpers"

vi.mock("@/routes/history/helpers", () => ({
	getRoutePath: vi.fn(() => "/global/super/project-1/topic-1"),
}))

vi.mock("@/utils/env", () => ({
	env: vi.fn(() => "https://magic.example.com"),
}))

describe("aiCardDeepLink", () => {
	it("generates a project topic URL with the ai_card query parameter", () => {
		const url = generateAICardDeepLink("project-1", "topic-1", "card-123")

		expect(url).toBe(
			"https://magic.example.com/global/super/project-1/topic-1?ai_card=card-123",
		)
		expect(AI_CARD_DEEP_LINK_QUERY_PARAM).toBe("ai_card")
		expect(getRoutePath).toHaveBeenCalledWith(
			expect.objectContaining({
				params: {
					projectId: "project-1",
					topicId: "topic-1",
				},
			}),
		)
	})

	it("creates a card id without the legacy aicard prefix", () => {
		const cardId = createAICardId()

		expect(cardId).toBeTruthy()
		expect(cardId).not.toMatch(/^aicard_/)
	})

	it("resolves an ai-card folder from display_config.card_id and prepares initial navigation", () => {
		const tree = [
			{
				file_id: "folder-1",
				is_directory: true,
				file_name: "运营日报",
				display_config: {
					type: "ai-card",
					card_id: "card-123",
				},
				children: [],
			},
		]

		const target = resolveAICardDeepLinkTarget(tree, "card-123")

		expect(target?.file).toEqual(
			expect.objectContaining({
				file_id: "folder-1",
				initialNavigation: {
					activeCardId: "folder-1",
					initialView: "detail",
				},
			}),
		)
	})
})
