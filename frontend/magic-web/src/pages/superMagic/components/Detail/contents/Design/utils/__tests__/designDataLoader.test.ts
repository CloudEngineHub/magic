import { describe, expect, it } from "vitest"
import { ElementTypeEnum } from "@/components/CanvasDesign/runtime/document/types"
import { loadDesignDataToRuntime } from "../designDataLoader"
import { MAGIC_PROJECT_VERSION_V3 } from "../magicProjectCompression"

describe("loadDesignDataToRuntime", () => {
	it("returns null for empty envelope content", async () => {
		await expect(loadDesignDataToRuntime({ content: "" })).resolves.toBeNull()
	})

	it("parses envelope content, upgrades it to v3, and applies the runtime name", async () => {
		const content = `window.magicProjectConfig = ${JSON.stringify({
			version: "1.0.0",
			type: "design",
			name: "legacy-name",
			canvas: {
				elements: [
					{
						id: "image-1",
						type: ElementTypeEnum.Image,
						src: "./images/a.png",
					},
				],
			},
		})};`

		const loaded = await loadDesignDataToRuntime({
			content,
			nameOverride: "current-directory",
		})

		expect(loaded?.data).toMatchObject({
			version: MAGIC_PROJECT_VERSION_V3,
			name: "current-directory",
			canvas: {
				elements: [
					{
						id: "image-1",
						activeContentId: "image-1-content-1",
						mainContentId: "image-1-content-1",
						contents: [{ contentId: "image-1-content-1", src: "./images/a.png" }],
					},
				],
			},
		})
	})

	it("clones and validates in-memory Draft data before returning it to Runtime", async () => {
		const draft = {
			version: "2.0.0",
			type: "design",
			name: "draft",
			canvas: {
				elements: [
					{
						id: "text-1",
						type: ElementTypeEnum.Text,
						content: [{ children: [{ type: "text" as const, text: "hello" }] }],
					},
				],
			},
		}

		const loaded = await loadDesignDataToRuntime({ designData: draft })

		expect(loaded?.data).not.toBe(draft)
		expect(loaded?.data.version).toBe(MAGIC_PROJECT_VERSION_V3)
		expect(loaded?.data.canvas?.elements?.[0]).toMatchObject({
			contents: [{ contentId: "text-1-content-1" }],
		})
		expect(draft.version).toBe("2.0.0")
	})
})
