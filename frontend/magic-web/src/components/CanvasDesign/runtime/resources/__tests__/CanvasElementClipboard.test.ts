import { describe, expect, it } from "vitest"
import {
	CANVAS_ELEMENT_CLIPBOARD_MIME_TYPE,
	CanvasElementClipboard,
} from "../clipboard/CanvasElementClipboard"
import type { CanvasElementClipboardFileMetadata } from "../clipboard/CanvasElementClipboard"

describe("CanvasElementClipboard", () => {
	it("reads external audio clipboard items as audio files", async () => {
		const item = {
			types: ["audio/mpeg"],
			getType: async () => new Blob(["audio"], { type: "audio/mpeg" }),
		} as ClipboardItem

		const file = await CanvasElementClipboard.readExternalFileItem(item)

		expect(file?.name).toBe("audio.mp3")
		expect(file?.type).toBe("audio/mpeg")
	})

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

	it("preserves source resolver identity and aliases in the clipboard payload", async () => {
		const metadata = CanvasElementClipboard.createGenerationResourceMetadata({
			fileId: "generation-resource:0",
			resourcePath: "./images/ref.png",
			resourceIdentity: "workspace:/画布A/images/ref.png",
			resourceAliases: ["./images/ref.png", "/画布A/images/ref.png"],
			filename: "ref.png",
			mimeType: "image/png",
			fileSize: 100,
		})
		const payload = CanvasElementClipboard.createPayload({
			elements: [
				{
					id: "image-1",
					type: "image",
					x: 0,
					y: 0,
					width: 100,
					height: 100,
					contents: [{ contentId: "image-1-content", src: "./images/owner.png" }],
					activeContentId: "image-1-content",
					mainContentId: "image-1-content",
				},
			],
			files: [metadata],
			operation: "copy-elements",
		})
		const item = {
			types: [CANVAS_ELEMENT_CLIPBOARD_MIME_TYPE],
			getType: async () => ({ text: async () => JSON.stringify(payload) }) as unknown as Blob,
		} as ClipboardItem

		const restored = await CanvasElementClipboard.readPayload([item])

		expect(restored?.files[0]).toEqual(
			expect.objectContaining({
				resourcePath: "./images/ref.png",
				resourceIdentity: "workspace:/画布A/images/ref.png",
				resourceAliases: ["./images/ref.png", "/画布A/images/ref.png"],
			}),
		)
	})

	it("preserves element media aliases in the clipboard payload", async () => {
		const element = {
			id: "image-1",
			type: "image" as const,
			x: 0,
			y: 0,
			width: 100,
			height: 100,
			contents: [{ contentId: "image-1-content", src: "./images/image.png" }],
			activeContentId: "image-1-content",
			mainContentId: "image-1-content",
		}
		const metadata = CanvasElementClipboard.createFileMetadata({
			element,
			fileId: "image-1:0",
			filename: "image.png",
			mimeType: "image/png",
			fileSize: 100,
			resourceIdentity: "workspace:/画布A/images/image.png",
			resourceAliases: ["./images/image.png", "/画布A/images/image.png"],
		})
		const payload = CanvasElementClipboard.createPayload({
			elements: [element],
			files: [metadata],
			operation: "copy-elements",
		})
		const item = {
			types: [CANVAS_ELEMENT_CLIPBOARD_MIME_TYPE],
			getType: async () => ({ text: async () => JSON.stringify(payload) }) as unknown as Blob,
		} as ClipboardItem

		const restored = await CanvasElementClipboard.readPayload([item])

		expect(restored?.files[0]).toEqual(
			expect.objectContaining({
				role: "element-media",
				resourceIdentity: "workspace:/画布A/images/image.png",
				resourceAliases: ["./images/image.png", "/画布A/images/image.png"],
			}),
		)
	})
})
