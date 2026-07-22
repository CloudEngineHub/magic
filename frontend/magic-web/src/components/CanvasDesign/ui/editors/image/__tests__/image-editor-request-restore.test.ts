import { describe, expect, it } from "vitest"
import { resolveImageEditorRequestToRestore } from "../image-editor-request-restore"

describe("resolveImageEditorRequestToRestore", () => {
	it("uses the accepted request when retrying a failed generation", () => {
		const currentRequest = {
			image_id: "accepted-task",
			model_id: "model-a",
			prompt: "create a poster",
			reference_images: ["images/reference.png"],
			reference_image_options: [{ path: "images/reference.png" }],
		}

		expect(
			resolveImageEditorRequestToRestore({
				currentRequest,
				tempRequest: {
					prompt: "",
					reference_images: [],
				},
				preferCurrentRequest: true,
			}),
		).toEqual(currentRequest)
	})

	it("keeps the existing draft-preferred behavior outside failed retries", () => {
		expect(
			resolveImageEditorRequestToRestore({
				currentRequest: {
					prompt: "saved prompt",
					reference_images: ["images/saved.png"],
				},
				tempRequest: {
					prompt: "",
					reference_images: [],
				},
			}),
		).toEqual({
			prompt: "",
			reference_images: [],
		})
	})
})
