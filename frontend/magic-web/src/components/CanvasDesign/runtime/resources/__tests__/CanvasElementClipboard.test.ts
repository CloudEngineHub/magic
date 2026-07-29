import { describe, expect, it } from "vitest"
import { CanvasElementClipboard } from "../clipboard/CanvasElementClipboard"
import type { CanvasElementClipboardFileMetadata } from "../clipboard/CanvasElementClipboard"

describe("CanvasElementClipboard", () => {
	it("ignores generation resource metadata when restoring event files", () => {
		const generationResourceMetadata: CanvasElementClipboardFileMetadata = {
			id: "generation-resource:0",
			elementId: "generation-resource:0",
			filename: "ref.png",
			mimeType: "image/png",
			fileSize: 0,
			role: "generation-resource",
			resourcePath: "source/ref.png",
			sourceRef: {
				src: "source/ref.png",
				ossUrl: "https://source.test/ref.png",
			},
		}
		const elementMetadata: CanvasElementClipboardFileMetadata = {
			id: "image-1:0",
			elementId: "image-1",
			filename: "image.png",
			mimeType: "image/png",
			fileSize: 0,
			role: "element-media",
			sourceRef: {
				src: "source/image.png",
				ossUrl: "https://source.test/image.png",
			},
		}

		const [canvasFile] = CanvasElementClipboard.createFilesFromEventFiles(
			[new File(["image"], "", { type: "image/png" })],
			[generationResourceMetadata, elementMetadata],
		)

		expect(canvasFile?.metadata).toBe(elementMetadata)
		expect(canvasFile?.file.name).toBe("image.png")
	})
})
