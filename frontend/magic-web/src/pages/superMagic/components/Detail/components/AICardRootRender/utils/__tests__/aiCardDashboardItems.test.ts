import { describe, expect, it } from "vitest"
import { buildAICardDashboardItems } from "../aiCardDashboardItems"
import type { AICardEntry, AICardHistoryEntry } from "../../types"

describe("buildAICardDashboardItems", () => {
	it("keeps the latest card before history cards", () => {
		const cards: AICardEntry[] = [
			{
				id: "card-1",
				name: "Daily Report",
				description: "Report card",
				latestHtmlFileId: "latest-file",
				lastUpdated: "2026-05-01T00:00:00Z",
				status: "active",
			},
		]
		const historyEntries: AICardHistoryEntry[] = [
			{
				fileId: "history-old",
				fileName: "2026-05-01_09-00.html",
				timestamp: "2026-05-01T09:00:00",
				displayTime: "2026-05-01 09:00",
			},
			{
				fileId: "history-new",
				fileName: "2026-05-03_09-00.html",
				timestamp: "2026-05-03T09:00:00",
				displayTime: "2026-05-03 09:00",
			},
		]
		const attachmentList = [
			{
				file_id: "root",
				is_directory: true,
				children: [
					{ file_id: "latest-file", created_at: "2026-05-02T09:00:00Z" },
					{
						file_id: "history",
						is_directory: true,
						children: [
							{ file_id: "history-old", created_at: "2026-05-01T09:00:00Z" },
							{ file_id: "history-new", created_at: "2026-05-03T09:00:00Z" },
						],
					},
				],
			},
		]

		const items = buildAICardDashboardItems({ cards, historyEntries, attachmentList })

		expect(items.map((item) => item.fileId)).toEqual([
			"latest-file",
			"history-new",
			"history-old",
		])
	})
})
