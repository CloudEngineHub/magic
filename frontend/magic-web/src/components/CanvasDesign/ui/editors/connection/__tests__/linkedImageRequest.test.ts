import { describe, expect, it } from "vitest"
import { buildImageRequestWithLinkedEditorInputs } from "../linkedImageRequest"

describe("buildImageRequestWithLinkedEditorInputs", () => {
	it("adds linked image crop options to the generated image request", () => {
		const request = buildImageRequestWithLinkedEditorInputs(
			{
				model_id: "image-model",
				prompt: "editable prompt",
				reference_images: ["/images/manual.png"],
			},
			{
				textPrompt: "linked prompt",
				activeMediaReferences: [
					{
						kind: "image",
						path: "/images/linked.png",
						sourceCrop: {
							x: 10,
							y: 20,
							width: 300,
							height: 200,
						},
					},
				],
			},
		)

		expect(request).toMatchObject({
			prompt: "linked prompt\neditable prompt",
			reference_images: ["/images/manual.png", "/images/linked.png"],
			reference_image_options: [
				{
					path: "/images/linked.png",
					crop: {
						x: 10,
						y: 20,
						width: 300,
						height: 200,
					},
				},
			],
		})
	})

	it("keeps manual reference image options before linked options", () => {
		const request = buildImageRequestWithLinkedEditorInputs(
			{
				model_id: "image-model",
				prompt: "editable prompt",
				reference_images: ["/images/manual.png"],
				reference_image_options: [
					{
						path: "/images/manual.png",
						crop: {
							x: 1,
							y: 2,
							width: 30,
							height: 40,
						},
					},
				],
			},
			{
				textPrompt: "",
				activeMediaReferences: [
					{
						kind: "image",
						path: "/images/linked.png",
						sourceCrop: {
							x: 10,
							y: 20,
							width: 300,
							height: 200,
						},
					},
				],
			},
		)

		expect(request.reference_image_options).toEqual([
			{
				path: "/images/manual.png",
				crop: {
					x: 1,
					y: 2,
					width: 30,
					height: 40,
				},
			},
			{
				path: "/images/linked.png",
				crop: {
					x: 10,
					y: 20,
					width: 300,
					height: 200,
				},
			},
		])
	})
})
