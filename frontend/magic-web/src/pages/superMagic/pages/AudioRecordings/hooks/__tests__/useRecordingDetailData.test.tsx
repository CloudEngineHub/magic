import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"
import { useRecordingDetailData } from "../useRecordingDetailData"

const queryProjectsMock = vi.hoisted(() => vi.fn())

vi.mock("@/services/audioRecordings", () => ({
	audioRecordingsService: {
		queryProjects: queryProjectsMock,
	},
}))

vi.mock("@/pages/superMagic/services/projectAttachmentsLoader", () => ({
	loadProjectAttachments: vi.fn(),
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentById: vi.fn(),
	getTemporaryDownloadUrl: vi.fn(),
}))

describe("useRecordingDetailData", () => {
	beforeEach(() => {
		queryProjectsMock.mockReset()
		queryProjectsMock.mockImplementation(async ({ projectIds }: { projectIds: string[] }) => ({
			list: [
				{
					id: projectIds[0],
					project_name: `Recording ${projectIds[0]}`,
					created_at: 1710000000,
					card_status: "summarized",
					current_phase: "summarizing",
					phase_status: "completed",
					audio_source: "recorded",
				},
			],
		}))
		vi.mocked(loadProjectAttachments).mockReset()
	})

	it("aborts the stale attachment request when the route project changes", async () => {
		const signals = new Map<string, AbortSignal>()
		vi.mocked(loadProjectAttachments).mockImplementation(({ projectId, signal }) => {
			signals.set(projectId, signal as AbortSignal)
			if (projectId === "project-two") {
				return Promise.resolve({
					tree: [],
					list: [],
					total: 0,
					sourceVersion: "v1",
					strategy: "count_v1",
					diagnostics: {},
				})
			}
			return new Promise(() => undefined)
		})

		const { result, rerender, unmount } = renderHook(
			({ projectId }) => useRecordingDetailData({ projectId }),
			{ initialProps: { projectId: "project-one" } },
		)

		await waitFor(() => expect(signals.has("project-one")).toBe(true))
		rerender({ projectId: "project-two" })

		await waitFor(() => expect(signals.get("project-one")?.aborted).toBe(true))
		await waitFor(() => expect(result.current.loading).toBe(false))
		expect(result.current.projectItem?.id).toBe("project-two")
		expect(loadProjectAttachments).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "project-two",
				signal: expect.any(AbortSignal),
			}),
		)

		unmount()
		expect(signals.get("project-two")?.aborted).toBe(true)
	})
})
