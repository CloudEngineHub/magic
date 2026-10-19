import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"
import {
	loadAllResearchTopics,
	loadResearchFiles,
	loadResearchTopics,
} from "../services/researchSnapshot"

vi.mock("@/pages/superMagic/services/projectAttachmentsLoader", () => ({
	loadProjectAttachments: vi.fn(),
}))

describe("complete research snapshots", () => {
	beforeEach(() => vi.restoreAllMocks())
	it("reads every topic page, including a remainder beyond the old 999 cap", async () => {
		const api = vi.spyOn(SuperMagicApi, "getTopicsByProjectId").mockImplementation(
			async ({ page, page_size }) =>
				({
					total: 1002,
					list: Array.from(
						{ length: Math.min(page_size, 1002 - (page - 1) * page_size) },
						(_, index) => ({ id: String((page - 1) * page_size + index) }),
					),
				}) as never,
		)
		const topics = await loadAllResearchTopics("project")
		expect(topics).toHaveLength(1002)
		expect(topics.at(-1)?.id).toBe("1001")
		expect(api).toHaveBeenCalledTimes(11)
	})
	it("rejects a repeated or truncated page", async () => {
		vi.spyOn(SuperMagicApi, "getTopicsByProjectId").mockResolvedValue({
			total: 3,
			list: [{ id: "one" }],
		} as never)
		await expect(loadAllResearchTopics("project")).rejects.toThrow("repeated")
		vi.mocked(SuperMagicApi.getTopicsByProjectId).mockResolvedValue({
			total: 3,
			list: [],
		} as never)
		await expect(loadAllResearchTopics("project")).rejects.toThrow("incomplete")
	})
	it("rejects changing totals while paging", async () => {
		vi.spyOn(SuperMagicApi, "getTopicsByProjectId")
			.mockResolvedValueOnce({ total: 2, list: [{ id: "one" }] } as never)
			.mockResolvedValueOnce({ total: 1, list: [{ id: "two" }] } as never)
		await expect(loadAllResearchTopics("project")).rejects.toThrow("changed")
	})
	it("requires the shared loader's complete V2 result with no adapter anomalies", async () => {
		vi.mocked(loadProjectAttachments).mockResolvedValue({
			sourceVersion: "v1",
			diagnostics: {},
		} as never)
		await expect(loadResearchFiles("project", true)).rejects.toThrow("incomplete")
		vi.mocked(loadProjectAttachments).mockResolvedValue({
			sourceVersion: "v2",
			diagnostics: { adapter_warning_codes: ["duplicate"] },
		} as never)
		await expect(loadResearchFiles("project", true)).rejects.toThrow("incomplete")
		const snapshot = { sourceVersion: "v2", tree: [], list: [], diagnostics: {} }
		vi.mocked(loadProjectAttachments).mockResolvedValue(snapshot as never)
		expect(await loadResearchFiles("project", true)).toBe(snapshot)
		expect(loadProjectAttachments).toHaveBeenLastCalledWith({
			projectId: "project",
			temporaryToken: "",
			includeHidden: true,
		})
	})
	it("keeps the loader's V1 fallback for non-destructive reads", async () => {
		const fallback = { sourceVersion: "v1", tree: [], list: [], diagnostics: {} }
		vi.mocked(loadProjectAttachments).mockResolvedValue(fallback as never)
		expect(await loadResearchFiles("project")).toBe(fallback)
		expect(loadProjectAttachments).toHaveBeenLastCalledWith({
			projectId: "project",
			temporaryToken: "",
			includeHidden: false,
		})
	})
	it("ordinary topic reads retain the legacy first page after pagination drift", async () => {
		const api = vi
			.spyOn(SuperMagicApi, "getTopicsByProjectId")
			.mockResolvedValueOnce({ total: 2, list: [{ id: "one" }] } as never)
			.mockResolvedValueOnce({ total: 1, list: [{ id: "two" }] } as never)
			.mockResolvedValueOnce({ total: 1, list: [{ id: "current" }] } as never)
		expect((await loadResearchTopics("project")).map((topic) => topic.id)).toEqual(["current"])
		expect(api).toHaveBeenLastCalledWith({ id: "project", page: 1, page_size: 999 })
	})
	it("does not retry authorization or network failures in ordinary reads", async () => {
		const original = new Error("HTTP 403")
		const api = vi.spyOn(SuperMagicApi, "getTopicsByProjectId").mockRejectedValue(original)
		await expect(loadResearchTopics("project")).rejects.toBe(original)
		expect(api).toHaveBeenCalledTimes(1)
	})
})
