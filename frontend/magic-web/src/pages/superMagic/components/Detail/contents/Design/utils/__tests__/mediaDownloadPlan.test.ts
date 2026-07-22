import { describe, expect, it } from "vitest"
import { resolveCanvasMediaDownloadPlan } from "../mediaDownloadPlan"

describe("resolveCanvasMediaDownloadPlan", () => {
	it("reuses project batch download for unique uncropped media", () => {
		const plan = resolveCanvasMediaDownloadPlan({
			fileIds: ["image-1", "video-1"],
			hasImageProcess: false,
			noWatermark: false,
			downloadMode: "default",
		})

		expect(plan.transport).toBe("project-batch")
		expect(plan.duplicatedFileIds.size).toBe(0)
	})

	it("uses the client zip when any element has a crop", () => {
		expect(
			resolveCanvasMediaDownloadPlan({
				fileIds: ["image-1", "image-2"],
				hasImageProcess: true,
				noWatermark: false,
				downloadMode: "default",
			}).transport,
		).toBe("client-zip")
	})

	it("uses the client zip for duplicate sources so every element is preserved", () => {
		const plan = resolveCanvasMediaDownloadPlan({
			fileIds: ["image-1", "image-1"],
			hasImageProcess: false,
			noWatermark: false,
			downloadMode: "default",
		})

		expect(plan.transport).toBe("client-zip")
		expect([...plan.duplicatedFileIds]).toEqual(["image-1"])
	})

	it("keeps explicit watermark modes in the client adapter", () => {
		expect(
			resolveCanvasMediaDownloadPlan({
				fileIds: ["image-1", "image-2"],
				hasImageProcess: false,
				noWatermark: true,
			}).transport,
		).toBe("client-zip")

		expect(
			resolveCanvasMediaDownloadPlan({
				fileIds: ["image-1", "image-2"],
				hasImageProcess: false,
				noWatermark: false,
				downloadMode: "normal",
			}).transport,
		).toBe("client-zip")
	})
})
