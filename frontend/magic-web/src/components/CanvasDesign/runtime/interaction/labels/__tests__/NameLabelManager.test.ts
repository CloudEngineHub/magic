import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Konva from "konva"
import { ElementTypeEnum, type ElementType } from "../../../document/types"
import { NameLabelManager } from "../NameLabelManager"
import type { NameLabelIconResolver } from "../nameLabelTypes"

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

	public getTextNodeForTest(elementId: string): Konva.Text | null {
		return this.labelMap.get(elementId)?.findOne(".name-label-text") as Konva.Text | null
	}

	public getRenderedTextWidthForTest(elementId: string): number | undefined {
		return this.getTextNodeForTest(elementId)?.width()
	}

	public getIconNodeForTest(elementId: string): Konva.Node | null {
		return this.labelMap.get(elementId)?.findOne(".name-label-icon") as Konva.Node | null
	}

	public updateLabelPositionForTest(elementId: string): boolean {
		return this.updateLabelPosition(elementId, true)
	}
}

function createManager(
	elements: Map<string, TestElement>,
	options: {
		selectedElementId?: string
		hoveredElementId?: string
		iconResolver?: NameLabelIconResolver
		sizeLabelManager?: {
			isLabelVisibleForElement: (elementId: string) => boolean
			getLabelSizeForElement: (elementId: string) => {
				width: number
				height: number
			} | null
		}
	} = {},
): TestNameLabelManager {
	return new TestNameLabelManager({
		iconResolver: options.iconResolver,
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
			overlayLayer: { add: vi.fn() },
			runtimeScheduler: { requestLayerDraw: vi.fn() },
			sizeLabelManager: options.sizeLabelManager,
			selectionManager: {
				isSelected: (elementId: string) => options.selectedElementId === elementId,
			},
			stage: {
				position: () => ({ x: 0, y: 0 }),
				scaleX: () => 1,
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
		expect(manager.isLabelVisibleByDefault("image-1")).toBe(false)

		manager.destroy()
	})

	it("keeps a narrow audio label visible and truncates its rendered text", () => {
		const getBoundingRect = () => ({ x: 0, y: 0, width: 100, height: 100 })
		const labelText = "A deliberately long audio name"
		const elements = new Map<string, TestElement>([
			[
				"audio-1",
				{
					getBoundingRect,
					getData: () => ({ id: "audio-1", type: ElementTypeEnum.Audio }),
					getNameLabelText: () => labelText,
					getNode: () => ({}),
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
		expect(manager.createOrUpdateLabelForTest("audio-1")).toBe(true)
		expect(manager.isLabelVisible("audio-1")).toBe(true)

		const textNode = manager.getTextNodeForTest("audio-1")
		expect(textNode?.text()).toBe(labelText)
		expect(textNode?.width()).toBeLessThanOrEqual(100)
		expect(textNode?.textArr[0]?.text.endsWith("…")).toBe(true)

		manager.destroy()
	})

	it("reserves an optional icon slot and resolves it outside layout-only updates", () => {
		const getBoundingRect = vi.fn(() => ({ x: 10, y: 20, width: 100, height: 80 }))
		const elements = new Map<string, TestElement>([
			[
				"audio-1",
				{
					getBoundingRect,
					getData: () => ({ id: "audio-1", type: ElementTypeEnum.Audio }),
					getNameLabelText: () => "Audio name",
					getNode: () => ({}),
				},
			],
		])
		const iconResolver = vi.fn<NameLabelIconResolver>(({ selected }) => ({
			key: selected ? "audio-selected" : "audio-status",
			width: 12,
			height: 12,
			create: () => new Konva.Rect({ width: 12, height: 12 }),
		}))
		const options: { selectedElementId?: string; iconResolver?: NameLabelIconResolver } = {
			iconResolver,
		}
		const manager = createManager(elements, options)

		manager.createOrUpdateLabelForTest("audio-1")
		const initialResolverCalls = iconResolver.mock.calls.length
		const textNode = manager.getTextNodeForTest("audio-1")
		const iconNode = manager.getIconNodeForTest("audio-1")

		expect(iconNode).toBeInstanceOf(Konva.Rect)
		expect(iconNode?.listening()).toBe(false)
		expect(textNode?.x()).toBe(16)
		expect(textNode?.width()).toBeLessThanOrEqual(84)

		manager.updateLabelPositionForTest("audio-1")
		expect(iconResolver).toHaveBeenCalledTimes(initialResolverCalls)
		const layoutCallsBeforeStableRefresh = getBoundingRect.mock.calls.length
		manager.refreshIcons(["audio-1"])
		expect(getBoundingRect).toHaveBeenCalledTimes(layoutCallsBeforeStableRefresh)

		expect(iconResolver).toHaveBeenCalledTimes(initialResolverCalls + 1)

		options.selectedElementId = "audio-1"
		manager.refreshIcons(["audio-1"])
		expect(iconResolver).toHaveBeenLastCalledWith(
			expect.objectContaining({ selected: true, elementId: "audio-1" }),
		)

		manager.destroy()
	})

	it("uses the complete text width for rename input when the label is truncated", () => {
		const labelText = "A long name for rename that is definitely wider than the element"
		const elements = new Map<string, TestElement>([
			[
				"audio-1",
				{
					getBoundingRect: () => ({ x: 10, y: 20, width: 40, height: 80 }),
					getData: () => ({ id: "audio-1", type: ElementTypeEnum.Audio }),
					getNameLabelText: () => labelText,
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements)

		const layout = manager.getRenameInputLayout("audio-1")
		expect(layout?.text).toBe(labelText)
		expect(layout?.width).toBeGreaterThan(40)

		manager.destroy()
	})

	it("reserves a visible size label and releases the space when it is hidden", () => {
		const sizeLabelManager = {
			isLabelVisibleForElement: vi.fn(() => true),
			getLabelSizeForElement: vi.fn(() => ({
				width: 30,
				height: 12,
			})),
		}
		const elements = new Map<string, TestElement>([
			[
				"audio-1",
				{
					getBoundingRect: () => ({ x: 10, y: 20, width: 100, height: 80 }),
					getData: () => ({ id: "audio-1", type: ElementTypeEnum.Audio }),
					getNameLabelText: () => "A deliberately long audio name",
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements, { sizeLabelManager })

		manager.createOrUpdateLabelForTest("audio-1")
		expect(manager.getRenderedTextWidthForTest("audio-1")).toBe(66)

		sizeLabelManager.isLabelVisibleForElement.mockReturnValue(false)
		manager.updateLabelPositionForTest("audio-1")
		expect(manager.getRenderedTextWidthForTest("audio-1")).toBe(100)

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
})
