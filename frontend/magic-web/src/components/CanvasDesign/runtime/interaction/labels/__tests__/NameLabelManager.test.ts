import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Konva from "konva"
import { ElementTypeEnum, type ElementType } from "../../../document/types"
import { NameLabelManager } from "../NameLabelManager"
import { SizeLabelManager } from "../SizeLabelManager"
import type { NameLabelIconResolver } from "../nameLabelTypes"
import type { NameLabelContent } from "../../../elements/core/BaseElement"

vi.mock("../../../resources/asset/assetComplianceState", () => ({
	getMediaAssetId: (content?: { assetId?: string }) => content?.assetId,
	resolveMediaComplianceStatus: (_canvas: unknown, content?: { complianceStatus?: string }) =>
		content?.complianceStatus,
	resolveMediaComplianceFailedReason: (
		_canvas: unknown,
		content?: { complianceFailedReason?: string | null },
	) => content?.complianceFailedReason ?? undefined,
}))

type TestElement = {
	getData: () => { id: string; type: ElementType; zIndex?: number }
	getBoundingRect?: () => { x: number; y: number; width: number; height: number }
	getNameLabelText?: () => string
	getNameLabelContent?: () => NameLabelContent
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

	public getTextNodeForTest(elementId: string): Konva.Text | null {
		return this.labelMap.get(elementId)?.findOne(".name-label-text") as Konva.Text | null
	}

	public getRenderedTextWidthForTest(elementId: string): number | undefined {
		return this.getTextNodeForTest(elementId)?.width()
	}

	public getIconNodeForTest(elementId: string): Konva.Node | null {
		return this.labelMap.get(elementId)?.findOne(".name-label-icon") as Konva.Node | null
	}

	public getSuffixNodeForTest(elementId: string): Konva.Text | null {
		return (
			(this.labelMap.get(elementId)?.findOne(".name-label-suffix") as Konva.Text | null) ??
			null
		)
	}

	public updateLabelPositionForTest(elementId: string): boolean {
		return this.updateLabelPosition(elementId, true)
	}

	public shouldSuppressSizeLabelForTest(elementId: string): boolean {
		return this.shouldSuppressSizeLabel(elementId)
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
		this.canvas.sizeLabelManager = this
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
		viewportPosition?: { x: number; y: number }
		candidateIds?: string[]
		parents?: Map<string, string>
		iconResolver?: NameLabelIconResolver
		canRename?: boolean
		mediaLabelsAlwaysVisible?: boolean
		sizeLabelManager?: {
			isLabelVisibleForElement?: (elementId: string) => boolean
			isLabelEligibleForNamePriority?: (elementId: string) => boolean
			refreshVisibilityForNamePriority?: (
				elementId: string,
				skipBatchDraw?: boolean,
			) => boolean
			getLabelSizeForElement: (elementId: string) => { width: number; height: number } | null
		}
	} = {},
): TestNameLabelManager {
	const runtimeElements = new Map<
		string,
		{ source: TestElement; element: TestElement & { supportsSizeEditing: () => boolean } }
	>()
	const getRuntimeElement = (elementId: string) => {
		const source = elements.get(elementId)
		if (!source) return undefined
		const cached = runtimeElements.get(elementId)
		if (cached?.source === source) return cached.element
		const element = {
			...source,
			getNode: () => source.getNode?.() ?? {},
			supportsSizeEditing: () => source.supportsSizeEditing?.() ?? false,
		}
		runtimeElements.set(elementId, { source, element })
		return element
	}

	const manager = new TestNameLabelManager({
		iconResolver: options.iconResolver,
		canvas: {
			cropManager: { getCroppingElementId: () => null },
			elementRenameManager: { canRename: () => options.canRename ?? true },
			elementManager: {
				getElementData: (elementId: string) => elements.get(elementId)?.getData(),
				getElementInstance: getRuntimeElement,
				getAllElementIds: () => Array.from(elements.keys()),
				findParentIdForElement: (id: string) => options.parents?.get(id),
				isElementVisibleInDataTree: () => true,
			},
			geometryCacheManager: {
				getElementBounds: (elementId: string) =>
					getRuntimeElement(elementId)?.getBoundingRect?.() ?? null,
				getRevision: () => 1,
				queryElementIdsByExpandedRect: () => options.candidateIds ?? [],
			},
			eraserManager: { getErasingElementId: () => null },
			eventEmitter: { on: vi.fn(() => vi.fn()) },
			extendManager: { getExtendingElementId: () => null },
			hoverManager: {
				getHoveredElementId: () => options.hoveredElementId ?? null,
			},
			overlayLayer: { add: vi.fn() },
			permissionManager: {
				canRename: () => options.canRename ?? true,
				canSelect: () => true,
			},
			sizeLabelManager: options.sizeLabelManager,
			runtimeScheduler: { requestLayerDraw: vi.fn() },
			selectionManager: {
				isSelected: (elementId: string) => options.selectedElementId === elementId,
				getSelectionCount: () => (options.selectedElementId ? 1 : 0),
				replaceSelection: vi.fn(),
			},
			stage: {
				position: () => options.viewportPosition ?? { x: 0, y: 0 },
				scaleX: () => options.viewportScale ?? 1,
			},
			textEditingManager: { isEditing: () => false },
			toolManager: (() => {
				const selectionTool = {}
				return {
					getSelectionTool: () => selectionTool,
					getActiveTool: () => selectionTool,
				}
			})(),
			viewportQueryCoordinator: {
				getSnapshot: () => ({ generation: 0, labelElementIds: [] }),
			},
		} as never,
	})
	const managerCanvas = manager.getCanvasForTest()
	managerCanvas.nameLabelManager = manager
	managerCanvas.sizeLabelManager =
		(options.sizeLabelManager as never) ??
		({
			labelConfig: { fontSize: 12, offsetTop: 5 },
			getIntrinsicLabelSize: (elementId: string) => {
				const sizeText = elements.get(elementId)?.getSizeLabelText?.() ?? ""
				return { width: sizeText.length * 8, height: 12 }
			},
		} as never)
	if (options.mediaLabelsAlwaysVisible ?? true) {
		// Layout tests opt into the explicit always-visible mode; production defaults to hover/select.
		manager.setMediaLabelsAlwaysVisible(true)
	}
	return manager
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
		const manager = createManager(elements, { mediaLabelsAlwaysVisible: false })

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

		// A foreign label group without cached layout state still takes the defensive width path.
		expect(manager.getTooWideLabelVisibility("audio-1")).toBe(false)
		expect(manager.getTooWideLabelVisibility("image-1")).toBeNull()
		expect(manager.createOrUpdateLabelForTest("audio-1")).toBe(true)
		expect(manager.isLabelVisible("audio-1")).toBe(true)

		const textNode = manager.getTextNodeForTest("audio-1")
		expect(textNode?.text()).toBe(labelText)
		expect(textNode?.width()).toBeLessThanOrEqual(100)
		expect(textNode?.textArr[0]?.text.endsWith("…")).toBe(true)

		manager.destroy()
	})

	it("truncates only the primary name and keeps the state suffix complete", () => {
		const labelContent: NameLabelContent = {
			primaryText: "A deliberately long audio name",
			suffix: { text: "(生成中)" },
		}
		const elements = new Map<string, TestElement>([
			[
				"audio-1",
				{
					getBoundingRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
					getData: () => ({ id: "audio-1", type: ElementTypeEnum.Audio }),
					getNameLabelContent: () => labelContent,
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements)

		manager.createOrUpdateLabelForTest("audio-1")

		const primaryNode = manager.getTextNodeForTest("audio-1")
		const suffixNode = manager.getSuffixNodeForTest("audio-1")
		expect(primaryNode?.text()).toBe(labelContent.primaryText)
		expect(primaryNode?.textArr[0]?.text.endsWith("…")).toBe(true)
		expect(suffixNode?.text()).toBe("(生成中)")
		expect(suffixNode?.x()).toBe(primaryNode?.width())
		expect((primaryNode?.width() ?? 0) + (suffixNode?.width() ?? 0)).toBeLessThanOrEqual(100)

		manager.destroy()
	})

	it("updates and removes a suffix when runtime label state changes", () => {
		let suffix: string | undefined = "(生成中)"
		const elements = new Map<string, TestElement>([
			[
				"audio-1",
				{
					getBoundingRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
					getData: () => ({ id: "audio-1", type: ElementTypeEnum.Audio }),
					getNameLabelContent: () => ({
						primaryText: "Audio name",
						suffix: suffix ? { text: suffix } : undefined,
					}),
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements)
		manager.createOrUpdateLabelForTest("audio-1")
		expect(manager.getSuffixNodeForTest("audio-1")?.text()).toBe("(生成中)")

		suffix = "(失败)"
		manager.refreshIcons(["audio-1"])
		expect(manager.getSuffixNodeForTest("audio-1")?.text()).toBe("(失败)")

		suffix = undefined
		manager.refreshIcons(["audio-1"])
		expect(manager.getSuffixNodeForTest("audio-1")).toBeNull()

		manager.destroy()
	})

	it("resolves optional icons only at discrete state changes", () => {
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
		expect(iconNode?.x()).toBe(0)
		expect(textNode?.x()).toBe(14)
		expect(textNode?.width()).toBeLessThanOrEqual(82)

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

	it("hides the optional icon before dropping mandatory text", () => {
		const elements = new Map<string, TestElement>([
			[
				"audio-1",
				{
					getBoundingRect: () => ({ x: 0, y: 0, width: 22, height: 80 }),
					getData: () => ({ id: "audio-1", type: ElementTypeEnum.Audio }),
					getNameLabelText: () => "Audio name",
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements, {
			iconResolver: () => ({
				key: "audio-status",
				width: 12,
				height: 12,
				create: () => new Konva.Rect({ width: 12, height: 12 }),
			}),
		})

		manager.createOrUpdateLabelForTest("audio-1")

		expect(manager.getIconNodeForTest("audio-1")?.visible()).toBe(false)
		expect(manager.getTextNodeForTest("audio-1")?.x()).toBe(0)
		expect(manager.isLabelVisible("audio-1")).toBe(true)

		manager.destroy()
	})

	it("uses only the primary text for rename and offsets the DOM label after an icon", () => {
		const primaryText = "Image title"
		const elements = new Map<string, TestElement>([
			[
				"image-1",
				{
					getBoundingRect: () => ({ x: 10, y: 20, width: 200, height: 80 }),
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
					getNameLabelContent: () => ({
						primaryText,
						suffix: { text: "(生成中)" },
					}),
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements, {
			canRename: true,
			iconResolver: () => ({
				key: "image-status",
				width: 12,
				height: 12,
				create: () => new Konva.Rect({ width: 12, height: 12 }),
			}),
		})

		const renameLayout = manager.getRenameInputLayout("image-1")
		const displayLayout = manager.getImageNameLabelLayout("image-1")
		const buttonLayout = manager.getRenameButtonLayout("image-1")

		expect(renameLayout?.text).toBe(primaryText)
		expect(renameLayout?.width).toBe(primaryText.length * 8)
		expect(displayLayout?.x).toBe(24)
		expect(displayLayout?.text).toBe(primaryText)
		expect(buttonLayout?.x).toBe(162)

		manager.destroy()
	})

	it("exposes the failed compliance icon geometry and reason to the DOM overlay", () => {
		const elements = new Map<string, TestElement>([
			[
				"image-1",
				{
					getBoundingRect: () => ({ x: 10, y: 20, width: 200, height: 80 }),
					getData: () =>
						({
							id: "image-1",
							type: ElementTypeEnum.Image,
							activeContentId: "content-1",
							contents: [
								{
									contentId: "content-1",
									complianceStatus: "FAILED",
									complianceFailedReason: "素材审核未通过",
								},
							],
						}) as never,
					getNameLabelText: () => "Image name",
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements, {
			iconResolver: ({ complianceStatus }) =>
				complianceStatus === "FAILED"
					? {
							key: "failure",
							width: 16,
							height: 16,
							create: () => new Konva.Rect({ width: 16, height: 16 }),
						}
					: null,
		})

		const layout = manager.getImageNameLabelLayout("image-1")
		expect(layout?.complianceIcon).toMatchObject({
			failedReason: "素材审核未通过",
			width: 16,
			height: 16,
		})

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
		const options: { iconResolver?: NameLabelIconResolver; selectedElementId?: string } = {
			iconResolver,
		}
		const manager = createManager(elements, options)

		manager.createOrUpdateLabelForTest("audio-1")
		const initialResolverCalls = iconResolver.mock.calls.length
		const textNode = manager.getTextNodeForTest("audio-1")
		const iconNode = manager.getIconNodeForTest("audio-1")

		expect(iconNode).toBeInstanceOf(Konva.Rect)
		expect(iconNode?.listening()).toBe(false)
		expect(iconNode?.x()).toBe(0)
		expect(textNode?.x()).toBe(14)
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

	it("notifies subscribed overlays with the scoped icon refresh", () => {
		const elements = new Map<string, TestElement>([
			[
				"image-1",
				{
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
				},
			],
		])
		const manager = createManager(elements)
		const listener = vi.fn()
		const unsubscribe = manager.subscribeIconRefresh(listener)

		manager.refreshIcons(["image-1"])
		expect(listener).toHaveBeenCalledWith(["image-1"])

		unsubscribe()
		manager.refreshIcons()
		expect(listener).toHaveBeenCalledTimes(1)

		manager.destroy()
	})

	it("uses the complete primary text width for rename input when the label is truncated", () => {
		const labelText = "A long name for rename that is definitely wider than the element"
		const elements = new Map<string, TestElement>([
			[
				"audio-1",
				{
					getBoundingRect: () => ({ x: 10, y: 20, width: 40, height: 80 }),
					getData: () => ({ id: "audio-1", type: ElementTypeEnum.Audio }),
					getNameLabelContent: () => ({
						primaryText: labelText,
						suffix: { text: "(生成中)" },
					}),
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements)

		const layout = manager.getRenameInputLayout("audio-1")
		expect(layout?.text).toBe(labelText)
		expect(layout?.width).toBeGreaterThan(40)
		expect(layout?.width).toBeLessThan((labelText + "(生成中)").length * 8)

		manager.destroy()
	})

	it("reads the cached DOM label layout without recomputing element geometry", () => {
		const viewportPosition = { x: 0, y: 0 }
		const getBoundingRect = vi.fn(() => ({ x: 10, y: 20, width: 160, height: 80 }))
		const elements = new Map<string, TestElement>([
			[
				"image-1",
				{
					getBoundingRect,
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
					getNameLabelText: () => "Cached image name",
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements, {
			selectedElementId: "image-1",
			viewportPosition,
		})

		expect(manager.getCachedImageNameLabelLayout("image-1")).toBeNull()
		expect(getBoundingRect).not.toHaveBeenCalled()

		const initialLayout = manager.getImageNameLabelLayout("image-1")
		expect(initialLayout).not.toBeNull()
		const geometryCallCount = getBoundingRect.mock.calls.length

		viewportPosition.x = 32
		viewportPosition.y = -12
		const movedLayout = manager.getCachedImageNameLabelLayout("image-1")

		expect(getBoundingRect).toHaveBeenCalledTimes(geometryCallCount)
		expect(movedLayout?.x).toBe((initialLayout?.x ?? 0) + 32)
		expect(movedLayout?.y).toBe((initialLayout?.y ?? 0) - 12)
		expect(movedLayout?.text).toBe("Cached image name")

		manager.destroy()
	})

	it("suppresses the size label when it would truncate the name", () => {
		const sizeLabelManager = {
			isLabelVisibleForElement: vi.fn(() => true),
			refreshVisibilityForNamePriority: vi.fn(() => true),
			getLabelSizeForElement: vi.fn(() => ({ width: 30, height: 12 })),
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
		expect(manager.shouldSuppressSizeLabelForTest("audio-1")).toBe(true)
		expect(sizeLabelManager.refreshVisibilityForNamePriority).toHaveBeenCalledWith(
			"audio-1",
			true,
		)
		expect(manager.getRenderedTextWidthForTest("audio-1")).toBe(100)
		expect(manager.getTextNodeForTest("audio-1")?.textArr[0]?.text.endsWith("…")).toBe(true)

		manager.destroy()
	})

	it("includes the complete suffix when deciding whether size must yield", () => {
		const sizeLabelManager = {
			isLabelVisibleForElement: vi.fn(() => true),
			getLabelSizeForElement: vi.fn(() => ({ width: 30, height: 12 })),
		}
		const elements = new Map<string, TestElement>([
			[
				"audio-1",
				{
					getBoundingRect: () => ({ x: 0, y: 0, width: 100, height: 80 }),
					getData: () => ({ id: "audio-1", type: ElementTypeEnum.Audio }),
					getNameLabelContent: () => ({
						primaryText: "Long name",
						suffix: { text: "(生成中)" },
					}),
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements, { sizeLabelManager })

		manager.createOrUpdateLabelForTest("audio-1")
		expect(manager.shouldSuppressSizeLabelForTest("audio-1")).toBe(true)
		expect(manager.getSuffixNodeForTest("audio-1")?.text()).toBe("(生成中)")

		manager.destroy()
	})

	it("restores the size label decision after the full name fits beside it", () => {
		let elementWidth = 100
		const sizeLabelManager = {
			isLabelVisibleForElement: vi.fn(() => true),
			getLabelSizeForElement: vi.fn(() => ({ width: 30, height: 12 })),
		}
		const elements = new Map<string, TestElement>([
			[
				"audio-1",
				{
					getBoundingRect: () => ({ x: 10, y: 20, width: elementWidth, height: 80 }),
					getData: () => ({ id: "audio-1", type: ElementTypeEnum.Audio }),
					getNameLabelText: () => "Long name",
					getNode: () => ({}),
				},
			],
		])
		const manager = createManager(elements, { sizeLabelManager })

		manager.createOrUpdateLabelForTest("audio-1")
		expect(manager.shouldSuppressSizeLabelForTest("audio-1")).toBe(true)

		elementWidth = 110
		manager.updateLabelPositionForTest("audio-1")
		expect(manager.shouldSuppressSizeLabelForTest("audio-1")).toBe(false)
		expect(manager.getRenderedTextWidthForTest("audio-1")).toBe(72)

		manager.destroy()
	})

	it("does not suppress size when it is independently hidden", () => {
		const sizeLabelManager = {
			isLabelVisibleForElement: vi.fn(() => false),
			getLabelSizeForElement: vi.fn(() => ({ width: 30, height: 12 })),
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
		expect(manager.shouldSuppressSizeLabelForTest("audio-1")).toBe(false)
		expect(manager.getRenderedTextWidthForTest("audio-1")).toBe(100)

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
	it("prioritizes the title, hides both labels when covered, and restores size after growth", () => {
		let upperX = 500
		let lowerWidth = 320
		const title = "A long image title that needs enough available space"
		const options = { candidateIds: ["upper"], viewportScale: 1 }
		const elements = new Map<string, TestElement>([
			[
				"lower",
				{
					getBoundingRect: () => ({ x: 0, y: 20, width: lowerWidth, height: 80 }),
					getData: () => ({ id: "lower", type: ElementTypeEnum.Image, zIndex: 1 }),
					getNameLabelText: () => title,
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
		const canvas = name.getCanvasForTest()
		const size = new TestSizeLabelManager({ canvas })
		canvas.nameLabelManager = name
		canvas.sizeLabelManager = size
		size.setMediaLabelsAlwaysVisible(true)
		name.createOrUpdateLabelForTest("lower")
		size.createForTest("lower")
		// The resolution yields first; the remaining 24px belongs to the rename operation.
		expect(name.getLabelTextMetrics("lower")?.width).toBe(296)
		expect(size.visibleForTest("lower")).toBe(false)
		options.viewportScale = 0.25
		name.createOrUpdateLabelForTest("lower")
		size.createForTest("lower")
		options.viewportScale = 1
		name.createOrUpdateLabelForTest("lower")
		size.createForTest("lower")
		expect(name.getLabelTextMetrics("lower")?.width).toBe(296)
		expect(size.visibleForTest("lower")).toBe(false)
		upperX = 260
		name.refreshVisibility()
		size.refreshForTest()
		expect(name.isLabelVisible("lower")).toBe(false)
		expect(size.visibleForTest("lower")).toBe(false)
		upperX = 500
		name.refreshVisibility()
		size.refreshForTest()
		expect(name.isLabelVisible("lower")).toBe(true)
		expect(size.visibleForTest("lower")).toBe(false)
		lowerWidth = 600
		name.createOrUpdateLabelForTest("lower")
		size.refreshForTest()
		expect(size.visibleForTest("lower")).toBe(true)
		name.destroy()
		size.destroy()
	})
})
