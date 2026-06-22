import { beforeEach, describe, expect, it, vi } from "vitest"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { AICardStore } from "../AICardStore"

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn(),
}))

const mockFetch = vi.fn()

function createAttachmentTree(overrides?: {
	latestUpdatedAt?: string
	configUpdatedAt?: string
	assetUpdatedAt?: string
}) {
	return [
		{
			file_id: "folder",
			file_name: "Daily Card",
			is_directory: true,
			children: [
				{
					file_id: "config",
					file_name: "magic.project.js",
					is_directory: false,
					updated_at: overrides?.configUpdatedAt ?? "2026-06-20T01:00:00Z",
				},
				{
					file_id: "latest",
					file_name: "latest",
					is_directory: true,
					children: [
						{
							file_id: "latest-html",
							file_name: "index.html",
							is_directory: false,
							updated_at: overrides?.latestUpdatedAt ?? "2026-06-20T02:00:00Z",
						},
						{
							file_id: "asset",
							file_name: "chart.png",
							is_directory: false,
							updated_at: overrides?.assetUpdatedAt ?? "2026-06-20T03:00:00Z",
						},
					],
				},
			],
		},
	]
}

describe("AICardStore", () => {
	beforeEach(() => {
		vi.mocked(getTemporaryDownloadUrl).mockReset()
		mockFetch.mockReset()
		vi.stubGlobal("fetch", mockFetch)

		vi.mocked(getTemporaryDownloadUrl).mockResolvedValue([
			{ url: "https://example.com/config.js" },
		])
		mockFetch.mockResolvedValue({
			ok: true,
			text: async () => `
				window.magicProjectConfig = {
					type: "ai-card",
					name: "Daily Card",
					description: "Daily metrics",
					cards: []
				}
			`,
		})
	})

	it("ignores unrelated attachment updates when syncing an existing AI card folder", async () => {
		const store = new AICardStore()

		await store.sync("folder", createAttachmentTree())
		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)

		await store.sync("folder", createAttachmentTree({ assetUpdatedAt: "2026-06-20T04:00:00Z" }))

		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
		expect(store.cards[0]?.latestHtmlFileId).toBe("latest-html")
	})

	it("parses magic.project.js with multiline template literal fields", async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			text: async () => `
				window.magicProjectConfig = {
					type: "ai-card",
					name: "Daily Card",
					prompt: \`line one
line two\`,
					schedule_id: "schedule-1",
					cards: [{ file: "latest/index.html", label: "Latest" }],
				}
			`,
		})

		const store = new AICardStore()

		await store.sync("folder", createAttachmentTree())

		expect(store.projectConfig?.schedule_id).toBe("schedule-1")
		expect(store.projectConfig?.prompt).toBe("line one\nline two")
		expect(store.hasConfig).toBe(true)
	})
})
