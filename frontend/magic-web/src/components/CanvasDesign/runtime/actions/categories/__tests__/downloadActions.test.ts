import { describe, expect, it, vi } from "vitest"
import { downloadActions } from "../downloadActions"
import type { UserAction } from "../../types"

function createCanvas(options?: {
	allowFileDownload?: boolean
	selectedIds?: string[]
	elements?: Array<[string, object]>
}) {
	const elements = new Map<string, object>([
		["video", { id: "video", type: "video", src: "videos/demo.mp4" }],
		["text", { id: "text", type: "text", content: [] }],
		["image", { id: "image", type: "image", src: "images/demo.png" }],
		["generating-image", { id: "generating-image", type: "image", src: "" }],
		...(options?.elements ?? []),
	])
	const downloadFiles = vi.fn().mockResolvedValue(undefined)

	return {
		canvas: {
			selectionManager: {
				getSelectedIds: () => options?.selectedIds ?? ["video", "text", "image"],
			},
			elementManager: {
				getElementData: (id: string) => elements.get(id),
			},
			imageResourceManager: {
				getResource: vi.fn().mockResolvedValue({
					imageInfo: { naturalWidth: 1200, naturalHeight: 800 },
				}),
			},
			magicConfigManager: {
				config: {
					permissions: { allowFileDownload: options?.allowFileDownload },
					methods: { downloadFiles },
				},
			},
		} as never,
		downloadFiles,
	}
}

describe("Canvas download actions", () => {
	it("downloads selected media in selection order and ignores non-media elements", async () => {
		const { canvas, downloadFiles } = createCanvas()
		const action = downloadActions.find((item) => item.id === "download.image") as
			| UserAction<"download.image">
			| undefined

		expect(action?.canExecute(canvas)).toBe(true)
		await action?.execute(canvas, { downloadMode: "normal" })

		expect(downloadFiles).toHaveBeenCalledWith(
			[expect.objectContaining({ id: "video" }), expect.objectContaining({ id: "image" })],
			false,
			false,
			{
				downloadMode: "normal",
				sourceDimensionsByElementId: {
					image: { width: 1200, height: 800 },
				},
			},
		)
	})

	it("blocks both menu visibility and execution when download permission is denied", async () => {
		const { canvas, downloadFiles } = createCanvas({ allowFileDownload: false })
		const action = downloadActions.find((item) => item.id === "download.image") as
			| UserAction<"download.image">
			| undefined

		expect(action?.canExecute(canvas)).toBe(false)
		await action?.execute(canvas, { downloadMode: "default" })
		expect(downloadFiles).not.toHaveBeenCalled()
	})

	it("passes unresolved selected media to the host so it can block the whole batch", async () => {
		const { canvas, downloadFiles } = createCanvas({
			selectedIds: ["image", "generating-image"],
		})
		const action = downloadActions.find((item) => item.id === "download.image") as
			| UserAction<"download.image">
			| undefined

		expect(action?.canExecute(canvas)).toBe(true)
		await action?.execute(canvas, { downloadMode: "default" })

		expect(downloadFiles).toHaveBeenCalledWith(
			[
				expect.objectContaining({ id: "image", src: "images/demo.png" }),
				expect.objectContaining({ id: "generating-image", src: "" }),
			],
			false,
			false,
			expect.objectContaining({ downloadMode: "default" }),
		)
	})

	it("hides the download action when all selected media sources are unavailable", async () => {
		const { canvas, downloadFiles } = createCanvas({ selectedIds: ["generating-image"] })
		const action = downloadActions.find((item) => item.id === "download.image") as
			| UserAction<"download.image">
			| undefined

		expect(action?.canExecute(canvas)).toBe(false)
		await action?.execute(canvas, { downloadMode: "default" })
		expect(downloadFiles).not.toHaveBeenCalled()
	})
})
