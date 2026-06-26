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

	it("matches folder display_config.card_id with the URL string value", () => {
		const tree = [
			{
				file_id: "folder-1",
				is_directory: true,
				file_name: "运营日报",
				display_config: {
					type: "ai-card",
					card_id: 123,
				},
				children: [],
			},
		]

		const target = resolveAICardDeepLinkTarget(tree, "123")

		expect(target?.file.file_id).toBe("folder-1")
	})

	it("resolves the ai-card root when card_id is mirrored on magic.project.js", () => {
		const tree = [
			{
				file_id: "folder-1",
				is_directory: true,
				file_name: "运营日报",
				display_config: {
					type: "ai-card",
				},
				children: [
					{
						file_id: "config-1",
						is_directory: false,
						file_name: "magic.project.js",
						display_config: {
							type: "ai-card",
							card_id: "card-123",
						},
					},
					{
						file_id: "latest-folder",
						is_directory: true,
						file_name: "latest",
						children: [
							{
								file_id: "latest-html",
								is_directory: false,
								file_name: "index.html",
							},
						],
					},
				],
			},
		]

		const target = resolveAICardDeepLinkTarget(tree, "card-123")

		expect(target?.file).toEqual(
			expect.objectContaining({
				file_id: "folder-1",
				file_name: "运营日报",
				initialNavigation: {
					activeCardId: "folder-1",
					initialView: "detail",
				},
			}),
		)
		expect(target?.file.file_id).not.toBe("config-1")
	})

	it("keeps ai-card display_config when only magic.project.js carries metadata", () => {
		const tree = [
			{
				file_id: "folder-1",
				is_directory: true,
				file_name: "运营日报",
				children: [
					{
						file_id: "config-1",
						is_directory: false,
						file_name: "magic.project.js",
						display_config: {
							type: "ai-card",
							card_id: "card-123",
						},
					},
					{
						file_id: "latest-html",
						is_directory: false,
						file_name: "latest.html",
					},
				],
			},
		]

		const target = resolveAICardDeepLinkTarget(tree, "card-123")

		expect(target?.file).toEqual(
			expect.objectContaining({
				file_id: "folder-1",
				display_config: {
					type: "ai-card",
					card_id: "card-123",
				},
				initialNavigation: {
					activeCardId: "folder-1",
					initialView: "detail",
				},
			}),
		)
	})
})
