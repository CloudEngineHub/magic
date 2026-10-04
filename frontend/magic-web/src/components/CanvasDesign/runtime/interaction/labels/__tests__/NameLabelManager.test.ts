import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ElementTypeEnum, type ElementType } from "../../../document/types"
import { NameLabelManager } from "../NameLabelManager"

type TestElement = {
	getData: () => { id: string; type: ElementType }
	getBoundingRect?: () => { x: number; y: number; width: number; height: number }
	getNameLabelText?: () => string
	getNode?: () => object
}

class TestNameLabelManager extends NameLabelManager {
	protected override reorderAllLabels(skipBatchDraw = false): void {
		void skipBatchDraw
	}

	public createOrUpdateLabelForTest(elementId: string): boolean {
		return this.createOrUpdateLabel(elementId)
	}

	public hasLabel(elementId: string): boolean {
		return this.labelMap.has(elementId)
	}

	public isLabelVisible(elementId: string): boolean | undefined {
		return this.labelMap.get(elementId)?.visible()
	}

	public getLabelScale(elementId: string): number | undefined {
		return this.labelMap.get(elementId)?.scaleX()
	}

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
	options: {
		selectedElementId?: string
		hoveredElementId?: string
		viewportScale?: number
	} = {},
): TestNameLabelManager {
	return new TestNameLabelManager({
		canvas: {
			cropManager: { getCroppingElementId: () => null },
			elementManager: {
				getElementInstance: (elementId: string) => elements.get(elementId),
				getAllElementIds: () => Array.from(elements.keys()),
			},
			eraserManager: { getErasingElementId: () => null },
			eventEmitter: { on: vi.fn(() => vi.fn()) },
			extendManager: { getExtendingElementId: () => null },
			hoverManager: {
				getHoveredElementId: () => options.hoveredElementId ?? null,
			},
			overlayLayer: { add: vi.fn() },
			runtimeScheduler: { requestLayerDraw: vi.fn() },
			selectionManager: {
				isSelected: (elementId: string) => options.selectedElementId === elementId,
			},
			stage: {
				position: () => ({ x: 0, y: 0 }),
				scaleX: () => options.viewportScale ?? 1,
			},
			viewportQueryCoordinator: {
				getSnapshot: () => ({ generation: 0, labelElementIds: [] }),
			},
		} as never,
	})
}

describe("NameLabelManager visibility", () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
		} as unknown as CanvasRenderingContext2D)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

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
		expect(manager.isLabelVisibleByDefault("image-1")).toBe(true)

		manager.destroy()
	})

	it("hides audio labels when the text exceeds the element width", () => {
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

		expect(manager.getTooWideLabelVisibility("audio-1")).toBe(false)
		expect(manager.getTooWideLabelVisibility("image-1")).toBeNull()

		manager.destroy()
	})

	it("retains a hidden media label only while renaming", () => {
		const options: { selectedElementId?: string } = {}
		const elements = new Map<string, TestElement>([
			[
				"image-1",
				{
					getBoundingRect: () => ({ x: 10, y: 20, width: 100, height: 80 }),
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
					getNameLabelText: () => "Image 1",
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements, options)
		manager.setMediaLabelsAlwaysVisible(false)

		expect(manager.createOrUpdateLabelForTest("image-1")).toBe(false)
		expect(manager.hasLabel("image-1")).toBe(false)

		manager.setRenamingElementId("image-1")
		expect(manager.getRenameInputLayout("image-1")).toMatchObject({ text: "Image 1" })
		expect(manager.hasLabel("image-1")).toBe(true)
		expect(manager.isLabelVisible("image-1")).toBe(false)

		manager.setRenamingElementId(null)
		expect(manager.hasLabel("image-1")).toBe(false)

		options.selectedElementId = "image-1"
		manager.setRenamingElementId("image-1")
		expect(manager.getRenameInputLayout("image-1")).not.toBeNull()
		expect(manager.isLabelVisible("image-1")).toBe(false)

		manager.setRenamingElementId(null)
		expect(manager.hasLabel("image-1")).toBe(true)
		expect(manager.isLabelVisible("image-1")).toBe(true)

		manager.destroy()
	})

	it("refreshes an existing media label immediately when the setting changes", () => {
		const elements = new Map<string, TestElement>([
			[
				"image-1",
				{
					getBoundingRect: () => ({ x: 0, y: 20, width: 100, height: 80 }),
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
					getNameLabelText: () => "Image 1",
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements)

		expect(manager.createOrUpdateLabelForTest("image-1")).toBe(true)
		expect(manager.isLabelVisible("image-1")).toBe(true)

		manager.setMediaLabelsAlwaysVisible(false)

		expect(manager.hasLabel("image-1")).toBe(false)
		manager.destroy()
	})

	it("limits inverse scale by the available element width at tiny viewport scales", () => {
		const elements = new Map<string, TestElement>([
			[
				"image-1",
				{
					getBoundingRect: () => ({ x: 0, y: 20, width: 40, height: 80 }),
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
					getNameLabelText: () => "Image 1",
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements, { viewportScale: 0.1 })

		manager.createOrUpdateLabelForTest("image-1")

		expect(manager.getLabelScale("image-1")).toBeLessThan(10)
		expect(manager.getLabelScale("image-1")).toBeGreaterThan(0)
		manager.destroy()
	})
})
