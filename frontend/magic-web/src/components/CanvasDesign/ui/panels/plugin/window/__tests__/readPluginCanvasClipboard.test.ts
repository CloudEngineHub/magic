import { describe, expect, it, vi } from "vitest"

const { read, pickPluginFiles } = vi.hoisted(() => ({
	read: vi.fn(),
	pickPluginFiles: vi.fn(),
}))

vi.mock("../../../../../runtime/resources/clipboard/CanvasElementClipboard", () => ({
	CanvasElementClipboard: { read },
}))

vi.mock("../../assets/fileAssets", () => ({
	pickPluginFiles,
}))

import { readPluginCanvasClipboard } from "../readPluginCanvasClipboard"

function createCanvas() {
	return {
		magicConfigManager: {
			config: {
				methods: {
					clipboard: {
						read: vi.fn(),
						readText: vi.fn(),
					},
				},
			},
		},
	} as never
}

describe("readPluginCanvasClipboard", () => {
	it("returns empty result when clipboard has no canvas payload", async () => {
		read.mockResolvedValue(null)

		await expect(readPluginCanvasClipboard(createCanvas())).resolves.toEqual({
			payload: null,
			uploadedAssets: [],
		})
	})

	it("returns payload without uploading for copy-elements", async () => {
		read.mockResolvedValue({
			payload: {
				source: "canvas-design",
				version: 1,
				operation: "copy-elements",
				files: [
					{
						id: "file-1",
						elementId: "element-1",
						filename: "canvas-image.png",
						mimeType: "image/png",
						fileSize: 0,
						role: "element-media",
						sourceRef: { src: "uploads/canvas-image.png", ossUrl: "https://example.com/a.png" },
					},
				],
			},
			files: [],
		})

		await expect(readPluginCanvasClipboard(createCanvas())).resolves.toEqual({
			payload: {
				source: "canvas-design",
				version: 1,
				operation: "copy-elements",
				files: [
					{
						id: "file-1",
						elementId: "element-1",
						filename: "canvas-image.png",
						mimeType: "image/png",
						fileSize: 0,
						role: "element-media",
						sourceRef: {
							src: "uploads/canvas-image.png",
							ossUrl: "https://example.com/a.png",
							expiresAt: undefined,
						},
					},
				],
			},
			uploadedAssets: [],
		})
		expect(pickPluginFiles).not.toHaveBeenCalled()
	})

	it("uploads clipboard blobs for copy-as-png", async () => {
		const file = new File([new Uint8Array([137, 80, 78, 71])], "export.png", {
			type: "image/png",
		})
		read.mockResolvedValue({
			payload: {
				source: "canvas-design",
				version: 1,
				operation: "copy-as-png",
				files: [
					{
						id: "file-1",
						elementId: "element-1",
						filename: "export.png",
						mimeType: "image/png",
						fileSize: file.size,
						role: "element-media",
					},
				],
			},
			files: [{ file }],
		})
		pickPluginFiles.mockResolvedValue([
			{
				id: "uploads/export.png",
				path: "uploads/export.png",
				url: "https://example.com/export.png",
				src: "https://example.com/export.png",
				fileName: "export.png",
				type: "image",
			},
		])

		const canvas = createCanvas()
		await expect(readPluginCanvasClipboard(canvas)).resolves.toEqual({
			payload: {
				source: "canvas-design",
				version: 1,
				operation: "copy-as-png",
				files: [
					{
						id: "file-1",
						elementId: "element-1",
						filename: "export.png",
						mimeType: "image/png",
						fileSize: file.size,
						role: "element-media",
					},
				],
			},
			uploadedAssets: [
				{
					id: "uploads/export.png",
					path: "uploads/export.png",
					url: "https://example.com/export.png",
					src: "https://example.com/export.png",
					fileName: "export.png",
					type: "image",
					sourceElementId: "element-1",
				},
			],
		})
		expect(pickPluginFiles).toHaveBeenCalledWith(canvas, [file], {
			type: "image",
			maxCount: 1,
		})
	})
})
