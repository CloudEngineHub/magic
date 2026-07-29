import { describe, expect, it } from "vitest"
import { resolveShowSelectedModelName } from "../utils"

describe("resolveShowSelectedModelName", () => {
	it("shows the selected model name when image and video tabs are both hidden", () => {
		expect(
			resolveShowSelectedModelName({
				showSelectedModelName: false,
				showImageTab: false,
				showVideoTab: false,
			}),
		).toBe(true)
	})

	it.each([
		{ showImageTab: true, showVideoTab: false },
		{ showImageTab: false, showVideoTab: true },
		{ showImageTab: true, showVideoTab: true },
	])("keeps the compact trigger when another tab is visible", (tabVisibility) => {
		expect(
			resolveShowSelectedModelName({
				showSelectedModelName: false,
				...tabVisibility,
			}),
		).toBe(false)
	})

	it("respects an explicitly enabled model name", () => {
		expect(
			resolveShowSelectedModelName({
				showSelectedModelName: true,
				showImageTab: true,
				showVideoTab: true,
			}),
		).toBe(true)
	})
})
