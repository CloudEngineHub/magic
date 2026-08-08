import { describe, expect, it } from "vitest"
import type { ImageElement, LayerElement } from "@/components/CanvasDesign/runtime/document/types"
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
