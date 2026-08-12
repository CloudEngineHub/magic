import { describe, expect, it, vi } from "vitest"
import { ElementTypeEnum } from "../../../document/types"
import { NameLabelManager } from "../NameLabelManager"

type TestElement = {
	getData: () => { id: string; type: ElementTypeEnum }
	getBoundingRect?: () => { x: number; y: number; width: number; height: number }
}

class TestNameLabelManager extends NameLabelManager {
	public isLabelVisibleByDefault(elementId: string): boolean | null {
		const element = this.canvas.elementManager.getElementInstance(elementId)
		return this.calculateBaseVisibility(elementId, element)
	}

	public getTooWideLabelVisibility(elementId: string): boolean | null {
		const element = this.canvas.elementManager.getElementInstance(elementId)
		return this.calculateCustomVisibility(
			elementId,
			element,
			{
				findOne: () => ({ width: () => 200 }),
				scaleX: () => 1,
				x: () => 0,
			} as never,
			true,
		)
	}
}

function createManager(
	elements: Map<string, TestElement>,
	options: { selectedElementId?: string; hoveredElementId?: string } = {},
): TestNameLabelManager {
	return new TestNameLabelManager({
		canvas: {
			cropManager: { getCroppingElementId: () => null },
			elementManager: {
				getElementInstance: (elementId: string) => elements.get(elementId),
			},
			eraserManager: { getErasingElementId: () => null },
			eventEmitter: { on: vi.fn(() => vi.fn()) },
			extendManager: { getExtendingElementId: () => null },
			hoverManager: {
				getHoveredElementId: () => options.hoveredElementId ?? null,
			},
			selectionManager: {
				isSelected: (elementId: string) => options.selectedElementId === elementId,
			},
		} as never,
	})
}

describe("NameLabelManager visibility", () => {
	it("keeps audio labels visible without hover or selection", () => {
		const elements = new Map<string, TestElement>([
			[
				"audio-1",
				{
					getData: () => ({ id: "audio-1", type: ElementTypeEnum.Audio }),
				},
			],
			[
				"image-1",
				{
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
				},
			],
		])
		const manager = createManager(elements)

		expect(manager.isLabelVisibleByDefault("audio-1")).toBe(true)
		expect(manager.isLabelVisibleByDefault("image-1")).toBe(false)

		manager.destroy()
	})

	it("does not hide audio labels when the text exceeds the element width", () => {
		const getBoundingRect = () => ({ x: 0, y: 0, width: 100, height: 100 })
		const elements = new Map<string, TestElement>([
			[
				"audio-1",
				{
					getBoundingRect,
					getData: () => ({ id: "audio-1", type: ElementTypeEnum.Audio }),
				},
			],
			[
				"image-1",
				{
					getBoundingRect,
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
				},
			],
		])
		const manager = createManager(elements)

		expect(manager.getTooWideLabelVisibility("audio-1")).toBeNull()
		expect(manager.getTooWideLabelVisibility("image-1")).toBe(false)

		manager.destroy()
	})
})
