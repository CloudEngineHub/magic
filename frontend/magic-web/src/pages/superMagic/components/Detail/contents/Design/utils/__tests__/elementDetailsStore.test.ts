import { describe, expect, it } from "vitest"
import type { LayerElement } from "@/components/CanvasDesign/runtime/document/types"
import {
	ELEMENT_DETAIL_SOURCE_USER,
	emptyElementDetailsDoc,
	rehydrateHeavyFields,
} from "../elementDetailsStore"

function imageElement(generateImageRequest?: Record<string, unknown>): LayerElement {
	return {
		id: "image-1",
		type: "image",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		generateImageRequest,
	} as LayerElement
}

describe("rehydrateHeavyFields provenance", () => {
	it("keeps the image id owned by Agent when a user overlay copies the same id", () => {
		const elements = [imageElement()]
		const provenance = rehydrateHeavyFields(
			elements,
			{
				version: "1.0.0",
				elements: {
					"image-1": {
						generateImageRequest: { image_id: "agent-file", prompt: "edited" },
						source: ELEMENT_DETAIL_SOURCE_USER,
					},
				},
			},
			{
				version: "1.0.0",
				elements: {
					"image-1": {
						generateImageRequest: { image_id: "agent-file", prompt: "original" },
					},
				},
			},
		)

		expect(elements[0]).toMatchObject({
			generateImageRequest: { image_id: "agent-file", prompt: "edited" },
		})
		expect(provenance["image-1"].generateImageRequest).toEqual({
			valueSource: "user",
			imageId: "agent-file",
			imageIdSource: "agent",
		})
	})

	it("recognizes a new user-side image id as a frontend Design task", () => {
		const elements = [imageElement()]
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
			{
				version: "1.0.0",
				elements: {
					"image-1": {
						generateImageRequest: { image_id: "agent-file", prompt: "original" },
					},
				},
			},
		)

		expect(provenance["image-1"].generateImageRequest?.imageIdSource).toBe("user")
	})

	it("marks legacy inline requests without sidecars as inline", () => {
		const elements = [imageElement({ image_id: "legacy-task", prompt: "legacy" })]
		const provenance = rehydrateHeavyFields(
			elements,
			emptyElementDetailsDoc(),
			emptyElementDetailsDoc(),
		)

		expect(provenance["image-1"].generateImageRequest).toEqual({
			valueSource: "inline",
			imageId: "legacy-task",
			imageIdSource: "inline",
		})
	})
})
