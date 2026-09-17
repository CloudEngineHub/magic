import { describe, expect, it } from "vitest"
import type {
	ImageElement,
	LayerElement,
	TextElement,
	VideoElement,
} from "@/components/CanvasDesign/runtime/document/types"
import {
	ELEMENT_DETAIL_SOURCE_USER,
	ELEMENT_DETAILS_VERSION,
	buildUserElementDetailsDoc,
	emptyElementDetailsDoc,
	rehydrateHeavyFields,
} from "../elementDetailsStore"

function imageElement(contents: ImageElement["contents"]): ImageElement {
	return {
		id: "image-1",
		type: "image",
		activeContentId: contents[0]?.contentId ?? null,
		mainContentId: contents[0]?.contentId ?? null,
		contents,
	}
}

function textElement(): TextElement {
	return {
		id: "text-1",
		type: "text",
		activeContentId: "c1",
		mainContentId: "c1",
		contents: [{ contentId: "c1", content: [] }],
	}
}

function videoElement(contents: VideoElement["contents"]): VideoElement {
	return {
		id: "video-1",
		type: "video",
		activeContentId: contents[0]?.contentId ?? null,
		mainContentId: contents[0]?.contentId ?? null,
		contents,
	}
}

describe("Content sidecar", () => {
	it("rehydrates requests by elementId and contentId", () => {
		const elements: LayerElement[] = [
			imageElement([
				{ contentId: "c1", generateImageRequest: { image_id: "one" } },
				{ contentId: "c2" },
			]),
		]
		const provenance = rehydrateHeavyFields(elements, emptyElementDetailsDoc(), {
			version: ELEMENT_DETAILS_VERSION,
			elements: {
				"image-1": {
					contentDetails: {
						c2: {
							generateImageRequest: { image_id: "two", prompt: "content two" },
							visualUnderstanding: { summary: "content two" },
						},
					},
				},
			},
		})

		expect((elements[0] as ImageElement).contents[1]).toEqual(
			expect.objectContaining({
				contentId: "c2",
				generateImageRequest: { image_id: "two", prompt: "content two" },
				visualUnderstanding: { summary: "content two" },
			}),
		)
		expect(provenance["image-1"].contentDetails?.c2.generateImageRequest).toEqual({
			valueSource: "agent",
			imageId: "two",
			imageIdSource: "agent",
		})
	})

	it("rehydrates and writes video generation runtime metadata", () => {
		const runtimeMetadata = {
			generation_info: {
				input_mode: "image_reference",
				resolution: "720p",
			},
			runtime: {
				started_at: "2026-09-14 14:00:14",
				finished_at: "2026-09-14 14:12:11",
				elapsed_seconds: 717,
			},
		}
		const elements: LayerElement[] = [videoElement([{ contentId: "c1" }])]

		rehydrateHeavyFields(elements, emptyElementDetailsDoc(), {
			version: ELEMENT_DETAILS_VERSION,
			elements: {
				"video-1": {
					contentDetails: {
						c1: { videoGenerationResultMeta: runtimeMetadata },
					},
				},
			},
		})

		expect((elements[0] as VideoElement).contents[0].videoGenerationResultMeta).toEqual(
			runtimeMetadata,
		)
		expect(buildUserElementDetailsDoc(elements, emptyElementDetailsDoc())).toEqual({
			version: ELEMENT_DETAILS_VERSION,
			elements: {
				"video-1": {
					source: ELEMENT_DETAIL_SOURCE_USER,
					contentDetails: {
						c1: { videoGenerationResultMeta: runtimeMetadata },
					},
				},
			},
		})
	})

	it("writes only Content-specific user details", () => {
		const elements: LayerElement[] = [
			imageElement([
				{ contentId: "c1", generateImageRequest: { image_id: "one" } },
				{ contentId: "c2", generateImageRequest: { image_id: "two" } },
			]),
		]
		const doc = buildUserElementDetailsDoc(elements, emptyElementDetailsDoc())

		expect(doc).toEqual({
			version: ELEMENT_DETAILS_VERSION,
			elements: {
				"image-1": {
					source: ELEMENT_DETAIL_SOURCE_USER,
					contentDetails: {
						c1: { generateImageRequest: { image_id: "one" } },
						c2: { generateImageRequest: { image_id: "two" } },
					},
				},
			},
		})
	})

	it("does not rehydrate or write visual understanding for non-media Contents", () => {
		const elements: LayerElement[] = [textElement()]
		const baseline = {
			version: ELEMENT_DETAILS_VERSION,
			elements: {
				"text-1": {
					contentDetails: {
						c1: { visualUnderstanding: { summary: "invalid text detail" } },
					},
				},
			},
		}

		rehydrateHeavyFields(elements, emptyElementDetailsDoc(), baseline)

		expect(elements[0].contents[0]).not.toHaveProperty("visualUnderstanding")
		expect(buildUserElementDetailsDoc(elements, baseline)).toEqual(emptyElementDetailsDoc())
	})

	it("migrates an old element-level sidecar entry into the first Content", () => {
		const elements: LayerElement[] = [imageElement([{ contentId: "c1" }])]
		const provenance = rehydrateHeavyFields(
			elements,
			{
				version: "1.0.0",
				elements: {
					"image-1": {
						generateImageRequest: { image_id: "user-task", prompt: "retry" },
						source: ELEMENT_DETAIL_SOURCE_USER,
					},
				},
			},
			emptyElementDetailsDoc(),
		)

		expect((elements[0] as ImageElement).contents[0].generateImageRequest).toEqual({
			image_id: "user-task",
			prompt: "retry",
		})
		expect(provenance["image-1"].contentDetails?.c1.generateImageRequest?.imageIdSource).toBe(
			"user",
		)
	})

	it("marks inline Content requests as inline", () => {
		const elements: LayerElement[] = [
			imageElement([
				{
					contentId: "c1",
					generateImageRequest: { image_id: "inline-task", prompt: "inline" },
				},
			]),
		]
		const provenance = rehydrateHeavyFields(
			elements,
			emptyElementDetailsDoc(),
			emptyElementDetailsDoc(),
		)

		expect(provenance["image-1"].contentDetails?.c1.generateImageRequest).toEqual({
			valueSource: "inline",
			imageId: "inline-task",
			imageIdSource: "inline",
		})
	})
})
