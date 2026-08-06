import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { useVideoGeneration } from "../useVideoGeneration"

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({ t: (key: string) => key }),
	}
})

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		fetchModeList: vi.fn(async () => []),
		fetchDefaultModeModelList: vi.fn(async () => undefined),
		getAllVideoModelGroups: vi.fn(),
	},
}))

function createGroup(id: string, name: string, modelId: string) {
	return {
		group: { id, name, icon: `${id}-icon`, sort: 1 },
		models: [
			{
				model_id: modelId,
				model_name: modelId,
				group_id: id,
			},
		],
	}
}

describe("useVideoGeneration model grouping", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("loads all supported models independently of the active topic", async () => {
		vi.mocked(superMagicModeService.getAllVideoModelGroups).mockReturnValue([
			createGroup("claude-video", "claude-video", "seedance-2-fast"),
			createGroup("video", "视频", "ke"),
		] as never)

		const { result } = renderHook(() =>
			useVideoGeneration({
				projectId: "project-1",
				updateAttachments: vi.fn(),
			}),
		)

		await expect(result.current.getVideoModelList()).resolves.toEqual([
			expect.objectContaining({
				model_id: "seedance-2-fast",
				model_group: expect.objectContaining({ id: "claude-video", name: "claude" }),
			}),
			expect.objectContaining({
				model_id: "ke",
				model_group: expect.objectContaining({ id: "video", name: "视频" }),
			}),
		])
		expect(superMagicModeService.fetchModeList).toHaveBeenCalledWith({ force: false })
		expect(superMagicModeService.fetchDefaultModeModelList).toHaveBeenCalledWith({
			force: false,
		})
		expect(superMagicModeService.getAllVideoModelGroups).toHaveBeenCalledTimes(1)
	})
})
