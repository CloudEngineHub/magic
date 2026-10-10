import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Konva from "konva"
import { ElementTypeEnum, type ElementType } from "../../../document/types"
import { NameLabelManager } from "../NameLabelManager"
import { SizeLabelManager } from "../SizeLabelManager"

type TestElement = {
	getData: () => { id: string; type: ElementType; zIndex?: number }
	getBoundingRect?: () => { x: number; y: number; width: number; height: number }
	getNameLabelText?: () => string
	getNode?: () => object
	supportsSizeEditing?: () => boolean
	getSizeLabelText?: () => string
}

class TestNameLabelManager extends NameLabelManager {
	protected override reorderAllLabels(skipBatchDraw = false): void {
		void skipBatchDraw
	}

	public createOrUpdateLabelForTest(elementId: string): boolean {
		return this.createOrUpdateLabel(elementId)
	}

	public getCanvasForTest() {
		return this.canvas
	}

	public refreshVisibility(): void {
		this.updateAllLabelsVisibility()
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

	public getLabelTextMetrics(
		elementId: string,
	): { width: number; naturalWidth: number; ellipsis: boolean } | null {
		const textNode = this.labelMap.get(elementId)?.findOne("Text") as Konva.Text | null
		if (!textNode) return null
		return {
			width: textNode.width(),
			naturalWidth: textNode.measureSize(textNode.text()).width,
			ellipsis: textNode.ellipsis(),
		}
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

class TestSizeLabelManager extends SizeLabelManager {
	public createForTest(id: string): void {
		this.createOrUpdateLabel(id)
	}
	public refreshForTest(): void {
		this.updateAllLabelsVisibility()
	}
	public visibleForTest(id: string): boolean {
		return this.labelMap.get(id)?.visible() ?? false
	}
}

function createManager(
	elements: Map<string, TestElement>,
	options: {
		selectedElementId?: string
		hoveredElementId?: string
		viewportScale?: number
		candidateIds?: string[]
		parents?: Map<string, string>
	} = {},
): TestNameLabelManager {
	return new TestNameLabelManager({
		canvas: {
			cropManager: { getCroppingElementId: () => null },
			elementManager: {
				getElementInstance: (elementId: string) => elements.get(elementId),
				getAllElementIds: () => Array.from(elements.keys()),
				findParentIdForElement: (id: string) => options.parents?.get(id),
			},
			geometryCacheManager: {
				queryElementIdsByExpandedRect: () => options.candidateIds ?? [],
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
			save: vi.fn(),
			restore: vi.fn(),
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

	it("keeps short names at the shared font size and ellipsizes long names", () => {
		const elements = new Map<string, TestElement>([
			[
				"image-1",
				{
					getBoundingRect: () => ({ x: 0, y: 20, width: 40, height: 80 }),
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
					getNameLabelText: () => "A very long generated image title",
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements)

		manager.createOrUpdateLabelForTest("image-1")
		const metrics = manager.getLabelTextMetrics("image-1")

		expect(metrics).not.toBeNull()
		expect(metrics?.ellipsis).toBe(true)
		expect(metrics?.width).toBeLessThanOrEqual(40)
		manager.destroy()
	})
	it("restores the available title width after zooming out and back in", () => {
		let width = 320
		let title = "A long title that must expand again"
		const options = { viewportScale: 1 }
		const elements = new Map<string, TestElement>([
			[
				"image-1",
				{
					getBoundingRect: () => ({ x: 0, y: 20, width, height: 80 }),
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
					getNameLabelText: () => title,
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements, options)
		manager.createOrUpdateLabelForTest("image-1")
		const fullWidth = manager.getLabelTextMetrics("image-1")?.width
		options.viewportScale = 0.15
		manager.createOrUpdateLabelForTest("image-1")
		expect(manager.getLabelTextMetrics("image-1")?.width).toBeLessThan(fullWidth ?? 0)
		options.viewportScale = 1
		manager.createOrUpdateLabelForTest("image-1")
		expect(manager.getLabelTextMetrics("image-1")?.width).toBe(fullWidth)
		for (let i = 0; i < 8; i++) manager.createOrUpdateLabelForTest("image-1")
		expect(manager.getLabelTextMetrics("image-1")?.width).toBe(fullWidth)
		width = 80
		manager.createOrUpdateLabelForTest("image-1")
		expect(manager.getRenameInputLayout("image-1")?.width).toBe(title.length * 8)
		title = "Changed title"
		width = 320
		manager.createOrUpdateLabelForTest("image-1")
		expect(manager.getLabelTextMetrics("image-1")?.width).toBe(title.length * 8)
		manager.destroy()
	})

	it("hides covered labels and restores them after moving, hiding or lowering the upper image", () => {
		let x = 0
		let zIndex = 2
		let visible = true
		const options = { candidateIds: ["upper"], parents: new Map<string, string>() }
		const elements = new Map<string, TestElement>([
			[
				"lower",
				{
					getBoundingRect: () => ({ x: 0, y: 20, width: 320, height: 80 }),
					getData: () => ({ id: "lower", type: ElementTypeEnum.Image, zIndex: 1 }),
					getNameLabelText: () => "Lower image",
					getNode: () => ({}),
				},
			],
			[
				"upper",
				{
					getBoundingRect: () => ({ x, y: 0, width: 320, height: 80 }),
					getData: () => ({ id: "upper", type: ElementTypeEnum.Image, zIndex }),
					getNode: () => ({ isVisible: () => visible, getAbsoluteOpacity: () => 1 }),
				},
			],
		])
		const manager = createManager(elements, options)
		manager.createOrUpdateLabelForTest("lower")
		expect(manager.isLabelVisible("lower")).toBe(false)
		x = 500
		manager.refreshVisibility()
		expect(manager.isLabelVisible("lower")).toBe(true)
		x = 0
		visible = false
		manager.refreshVisibility()
		expect(manager.isLabelVisible("lower")).toBe(true)
		visible = true
		zIndex = 0
		manager.refreshVisibility()
		expect(manager.isLabelVisible("lower")).toBe(true)
		zIndex = 2
		options.parents.set("upper", "other-frame")
		manager.refreshVisibility()
		expect(manager.isLabelVisible("lower")).toBe(true)
		options.parents.clear()
		manager.refreshVisibility()
		expect(manager.isLabelVisible("lower")).toBe(false)
		elements.delete("upper")
		manager.refreshVisibility()
		expect(manager.isLabelVisible("lower")).toBe(true)
		manager.destroy()
	})
	it("uses the available title space and hides both labels when the resolution is covered", () => {
		let upperX = 500
		const options = { candidateIds: ["upper"], viewportScale: 1 }
		const elements = new Map<string, TestElement>([
			[
				"lower",
				{
					getBoundingRect: () => ({ x: 0, y: 20, width: 320, height: 80 }),
					getData: () => ({ id: "lower", type: ElementTypeEnum.Image, zIndex: 1 }),
					getNameLabelText: () => "A long image title that needs enough available space",
					getSizeLabelText: () => "2560 x 1440",
					supportsSizeEditing: () => true,
					getNode: () => ({}),
				},
			],
			[
				"upper",
				{
					getBoundingRect: () => ({ x: upperX, y: 0, width: 100, height: 80 }),
					getData: () => ({ id: "upper", type: ElementTypeEnum.Image, zIndex: 2 }),
					getNode: () => ({ isVisible: () => true, getAbsoluteOpacity: () => 1 }),
				},
			],
		])
		const name = createManager(elements, options)
		const size = new TestSizeLabelManager({ canvas: name.getCanvasForTest() })
		name.createOrUpdateLabelForTest("lower")
		size.createForTest("lower")
		// 320px total - 88px resolution - 4px gap = 228px title.
		expect(name.getLabelTextMetrics("lower")?.width).toBe(228)
		options.viewportScale = 0.25
		name.createOrUpdateLabelForTest("lower")
		size.createForTest("lower")
		options.viewportScale = 1
		name.createOrUpdateLabelForTest("lower")
		size.createForTest("lower")
		expect(name.getLabelTextMetrics("lower")?.width).toBe(228)
		upperX = 260
		name.refreshVisibility()
		size.refreshForTest()
		expect(name.isLabelVisible("lower")).toBe(false)
		expect(size.visibleForTest("lower")).toBe(false)
		upperX = 500
		name.refreshVisibility()
		size.refreshForTest()
		expect(name.isLabelVisible("lower")).toBe(true)
		expect(size.visibleForTest("lower")).toBe(true)
		name.destroy()
		size.destroy()
	})
})
