import { describe, expect, it } from "vitest"
import { ElementTypeEnum } from "../../../document/types"
import { SizeLabelManager } from "../SizeLabelManager"

type TestElement = {
	getData: () => { id: string; type: ElementTypeEnum }
	supportsSizeEditing: () => boolean
}

class TestSizeLabelManager extends SizeLabelManager {
	public static create(elements: Map<string, TestElement>): TestSizeLabelManager {
		const manager = Object.create(TestSizeLabelManager.prototype) as TestSizeLabelManager
		manager.canvas = {
			elementManager: {
				getElementInstance: (elementId: string) => elements.get(elementId),
			},
		} as never
		manager.visibilityConfig = {
			elementTypes: new Set([ElementTypeEnum.Image, ElementTypeEnum.Storyboard]),
			alwaysVisibleTypes: new Set(),
			hoverOrSelectTypes: new Set(),
		}
		return manager
	}

	public shouldShowLabelForTest(elementId: string): boolean {
		return this.shouldShowLabel(elementId)
	}
}

describe("SizeLabelManager size editing guard", () => {
	it("hides labels for elements that do not support size editing", () => {
		const manager = TestSizeLabelManager.create(
			new Map([
				[
					"storyboard-1",
					{
						getData: () => ({
							id: "storyboard-1",
							type: ElementTypeEnum.Storyboard,
						}),
						supportsSizeEditing: () => false,
					},
				],
				[
					"image-1",
					{
						getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
						supportsSizeEditing: () => true,
					},
				],
			]),
		)

		expect(manager.shouldShowLabelForTest("storyboard-1")).toBe(false)
		expect(manager.shouldShowLabelForTest("image-1")).toBe(true)
	})
})
