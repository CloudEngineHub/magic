import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import superMagicCustomModelService from "@/services/superMagic/SuperMagicCustomModelService"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { useImageGeneration } from "../useImageGeneration"

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			i18n: { language: "zh_CN" },
			t: (key: string) => key,
		}),
	}
})

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		fetchModeList: vi.fn(async () => []),
		fetchDefaultModeModelList: vi.fn(async () => undefined),
		getAllImageModelGroups: vi.fn(),
	},
}))

vi.mock("@/services/superMagic/SuperMagicCustomModelService", () => ({
	default: {
		getMyModelsByType: vi.fn(async () => []),
	},
}))

describe("useImageGeneration model grouping", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("loads all supported models with the default grouping configuration", async () => {
		vi.mocked(superMagicModeService.getAllImageModelGroups).mockReturnValue([
			{
				group: { id: "claude-image", name: "claude-image", icon: "", sort: 1 },
				models: [
					{
						id: "image-1",
						group_id: "claude-image",
						model_id: "image-fast",
						model_name: "Image Fast",
					},
				],
			},
		] as never)

		const { result } = renderHook(() =>
			useImageGeneration({
				projectId: "project-image-model-grouping",
				updateAttachments: vi.fn(),
			}),
		)

		await expect(result.current.getImageModelList()).resolves.toEqual([
			expect.objectContaining({
				model_id: "image-fast",
				model_group: expect.objectContaining({ id: "claude-image", name: "claude" }),
			}),
		])
		expect(superMagicModeService.fetchModeList).toHaveBeenCalledWith({ force: false })
		expect(superMagicModeService.fetchDefaultModeModelList).toHaveBeenCalledWith({
			force: false,
		})
		expect(superMagicModeService.getAllImageModelGroups).toHaveBeenCalledTimes(1)
		expect(superMagicCustomModelService.getMyModelsByType).toHaveBeenCalledTimes(1)
	})
})
