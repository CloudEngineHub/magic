import { beforeEach, describe, expect, it } from "vitest"
import type { LayerElement } from "@/components/CanvasDesign/runtime/document/types"
import {
	buildCanvasElementFileIndex,
	getCanvasElementIdsByFileId,
	setCanvasElementFileIndex,
} from "../canvasElementFileIndex"

function imageElement(id: string, sources: string[]): LayerElement {
	return {
		id,
		type: "image",
		activeContentId: `${id}-content`,
		mainContentId: `${id}-content`,
		contents: sources.map((src, index) => ({
			contentId: `${id}-content-${index}`,
			src,
		})),
	} as unknown as LayerElement
}

function videoElement(id: string, src: string): LayerElement {
	return {
		id,
		type: "video",
		activeContentId: `${id}-content`,
		mainContentId: `${id}-content`,
		contents: [{ contentId: `${id}-content`, src }],
	} as unknown as LayerElement
}

describe("canvasElementFileIndex", () => {
	beforeEach(() => {
		setCanvasElementFileIndex("canvas-project", null)
	})

	it("indexes nested image and video elements by their project file id", () => {
		const resolveFileBySrc = (src: string) => {
			const fileId = src.includes("cover") ? "file-cover" : "file-shot"
			return { file_id: fileId }
		}
		const elements = [
			{
				id: "frame-1",
				type: "frame",
				children: [imageElement("image-1", ["./images/shot.png", "./images/cover.png"])],
			},
			videoElement("video-1", "./videos/shot.mp4"),
		] as LayerElement[]

		const index = buildCanvasElementFileIndex({ elements, resolveFileBySrc })

		expect(index.elementIdsByFileId.get("file-shot")).toEqual(["image-1", "video-1"])
		expect(index.elementIdsByFileId.get("file-cover")).toEqual(["image-1"])
	})

	it("uses file id instead of a duplicated basename in different directories", () => {
		const resolveFileBySrc = (src: string) => ({
			file_id: src.includes("/covers/") ? "file-cover" : "file-image",
		})
		const elements = [
			imageElement("image-1", ["./images/same.png"]),
			imageElement("image-2", ["./covers/same.png"]),
		]

		const index = buildCanvasElementFileIndex({ elements, resolveFileBySrc })

		expect(index.elementIdsByFileId.get("file-image")).toEqual(["image-1"])
		expect(index.elementIdsByFileId.get("file-cover")).toEqual(["image-2"])
	})

	it("keeps every element when one file is referenced more than once", () => {
		const elements = [
			imageElement("image-1", ["./images/shared.png"]),
			imageElement("image-2", ["./images/shared.png"]),
		]

		const index = buildCanvasElementFileIndex({
			elements,
			resolveFileBySrc: () => ({ file_id: "shared-file" }),
		})

		expect(index.elementIdsByFileId.get("shared-file")).toEqual(["image-1", "image-2"])
	})

	it("ignores unsupported media and sources without a resolved file id", () => {
		const elements = [
			imageElement("image-1", ["./images/missing.png"]),
			{
				id: "audio-1",
				type: "audio",
				activeContentId: "audio-content",
				mainContentId: "audio-content",
				contents: [{ contentId: "audio-content", src: "./audios/voice.mp3" }],
			} as unknown as LayerElement,
		]

		const index = buildCanvasElementFileIndex({ elements, resolveFileBySrc: () => null })

		expect(index.elementIdsByFileId.size).toBe(0)
	})

	it("scopes lookups to the active Canvas project and clears on unregister", () => {
		setCanvasElementFileIndex("canvas-project", {
			elementIdsByFileId: new Map([["file-1", ["element-1"]]]),
		})

		expect(getCanvasElementIdsByFileId("canvas-project", "file-1")).toEqual(["element-1"])
		expect(getCanvasElementIdsByFileId("another-project", "file-1")).toEqual([])

		setCanvasElementFileIndex("canvas-project", null)

		expect(getCanvasElementIdsByFileId("canvas-project", "file-1")).toEqual([])
	})
})
