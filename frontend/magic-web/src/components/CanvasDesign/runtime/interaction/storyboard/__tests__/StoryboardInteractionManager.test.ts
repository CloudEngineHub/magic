import Konva from "konva"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EventEmitter } from "../../../core/EventEmitter"
import {
	ElementTypeEnum,
	type CanvasConnection,
	type LayerElement,
	type StoryboardElement,
} from "../../../document/types"
import type { Canvas } from "../../../core/Canvas"
import { StoryboardInteractionManager } from "../StoryboardInteractionManager"
import type { ImageModelItem } from "../../../../public/magic-types"

function createStoryboardData(): StoryboardElement {
	return {
		id: "storyboard-1",
		type: ElementTypeEnum.Storyboard,
		x: 0,
		y: 0,
		width: 960,
		height: 1360,
		shots: [
			{
				id: "shot-1",
				durationSeconds: 3,
				description: "",
			},
		],
	}
}

function createCanvasMock(
	data: StoryboardElement,
	additionalElements: LayerElement[] = [],
	connections: CanvasConnection[] = [],
) {
	const eventEmitter = new EventEmitter()
	const selected = { value: false }
	const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
	const rerender = vi.fn()
	const container = document.createElement("div")
	document.body.appendChild(container)
	const elements = new Map<string, LayerElement>([
		[data.id, data],
		...additionalElements.map((element) => [element.id, element] as const),
	])
	const removeConnections = vi.fn((connectionIds: string[]) => connectionIds)
	const canvas = {
		eventEmitter,
		contentLayer: { batchDraw: vi.fn() },
		stage: { container: () => container },
		readonly: false,
		deviceInfo: {
			formFactor: "desktop",
			input: { touch: false, coarsePointer: false, hover: true },
			viewport: { width: 1000, height: 800 },
		},
		magicConfigManager: {
			config: { methods: { getImageModelList: vi.fn().mockResolvedValue([]) } },
		},
		selectionManager: {
			getSelectionCount: vi.fn(() => (selected.value ? 1 : 0)),
			isSelected: vi.fn(() => selected.value),
		},
		permissionManager: {
			canUseSelectionToolAffordance: vi.fn(() => true),
		},
		cursorManager: {
			setTemporary: vi.fn(),
			restoreToolCursor: vi.fn(),
		},
		connectionManager: {
			getDownstreamConnections: vi.fn((elementId: string) =>
				connections.filter((connection) => connection.sourceElementId === elementId),
			),
			removeConnections,
		},
		elementManager: {
			elements,
			getElementData: vi.fn((elementId: string) => elements.get(elementId)),
			getAllElementIds() {
				return Array.from(this.elements.keys())
			},
			getElementInstance: vi.fn(() => ({ rerender })),
			create: vi.fn((element: LayerElement) => elements.set(element.id, element)),
			delete: vi.fn((elementId: string) => elements.delete(elementId)),
			update: vi.fn((id: string, patch: Record<string, unknown>) =>
				updates.push({ id, patch }),
			),
		},
	} as unknown as Canvas

	return {
		canvas,
		selected,
		updates,
		rerender,
		eventEmitter,
		container,
		elements,
		removeConnections,
	}
}

function createTouchEvent(type: string, touchCount: number): Event {
	const event = new Event(type)
	Object.defineProperty(event, "touches", {
		configurable: true,
		value: Array.from({ length: touchCount }, () => ({})),
	})
	return event
}

describe("StoryboardInteractionManager", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe = vi.fn()
				unobserve = vi.fn()
				disconnect = vi.fn()
			},
		)
		if (!HTMLElement.prototype.scrollIntoView) {
			Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
				configurable: true,
				value: vi.fn(),
			})
		}
		vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => undefined)
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
		} as unknown as CanvasRenderingContext2D)
	})

	afterEach(() => {
		document.body.innerHTML = ""
		vi.restoreAllMocks()
	})

	it("keeps the first click for selecting an unselected node and activates after selection", () => {
		const data = createStoryboardData()
		const harness = createCanvasMock(data)
		const manager = new StoryboardInteractionManager({ canvas: harness.canvas })
		const hit = new Konva.Rect({ width: 100, height: 40 })
		const states: string[] = []
		const cleanup = manager.bindControl({
			elementId: data.id,
			node: hit,
			action: { type: "add-shot" },
			applyState: (state) => states.push(state),
		})

		hit.fire("mousedown", { evt: new MouseEvent("mousedown", { button: 0 }) })
		hit.fire("mouseup", { evt: new MouseEvent("mouseup", { button: 0 }) })
		hit.fire("click", { evt: new MouseEvent("click", { button: 0 }) })
		expect(harness.updates).toHaveLength(0)

		harness.selected.value = true
		hit.fire("mousedown", { evt: new MouseEvent("mousedown", { button: 0 }) })
		expect(states).toContain("pressed")
		hit.fire("mouseup", { evt: new MouseEvent("mouseup", { button: 0 }) })
		hit.fire("click", { evt: new MouseEvent("click", { button: 0 }) })
		expect(harness.updates).toHaveLength(1)
		expect((harness.updates[0].patch.shots as unknown[]).length).toBe(2)

		cleanup()
		manager.destroy()
	})

	it("adds a shot without precreating an output after a previous generation", () => {
		const data = createStoryboardData()
		data.shots![0].outputImageElementId = "image-output"
		const outputImage: LayerElement = {
			id: "image-output",
			type: ElementTypeEnum.Image,
			x: 1000,
			y: 0,
			width: 512,
			height: 512,
		}
		const harness = createCanvasMock(data, [outputImage])
		harness.selected.value = true
		const manager = new StoryboardInteractionManager({ canvas: harness.canvas })
		const hit = new Konva.Rect({ width: 100, height: 40 })
		manager.bindControl({
			elementId: data.id,
			node: hit,
			action: { type: "add-shot" },
			applyState: vi.fn(),
		})

		hit.fire("mousedown", { evt: new MouseEvent("mousedown", { button: 0 }) })
		hit.fire("mouseup", { evt: new MouseEvent("mouseup", { button: 0 }) })
		hit.fire("click", { evt: new MouseEvent("click", { button: 0 }) })

		const shots = harness.updates[0]?.patch.shots as StoryboardElement["shots"]
		expect(shots).toHaveLength(2)
		expect(shots?.[1]?.outputImageElementId).toBeUndefined()
		expect(harness.canvas.elementManager.create).not.toHaveBeenCalled()
		expect(harness.elements.has("image-output")).toBe(true)

		manager.destroy()
	})

	it("deletes only the locked output connection when removing a generated shot", () => {
		const data = createStoryboardData()
		data.shots = [
			{
				id: "shot-1",
				durationSeconds: 3,
				description: "wide shot",
				outputImageElementId: "image-output",
			},
			{
				id: "shot-2",
				durationSeconds: 3,
				description: "close up",
			},
		]
		const outputImage: LayerElement = {
			id: "image-output",
			type: ElementTypeEnum.Image,
			x: 1000,
			y: 0,
			width: 512,
			height: 512,
		}
		const outputConnection: CanvasConnection = {
			id: "storyboard-output",
			sourceElementId: data.id,
			targetElementId: outputImage.id,
			locked: true,
		}
		const harness = createCanvasMock(data, [outputImage], [outputConnection])
		harness.selected.value = true
		const manager = new StoryboardInteractionManager({ canvas: harness.canvas })
		const hit = new Konva.Rect({ width: 100, height: 40 })
		manager.bindControl({
			elementId: data.id,
			node: hit,
			action: { type: "delete-shot", shotId: "shot-1" },
			applyState: vi.fn(),
		})

		hit.fire("mousedown", { evt: new MouseEvent("mousedown", { button: 0 }) })
		hit.fire("mouseup", { evt: new MouseEvent("mouseup", { button: 0 }) })
		hit.fire("click", { evt: new MouseEvent("click", { button: 0 }) })

		expect(harness.removeConnections).toHaveBeenCalledWith([outputConnection.id], {
			force: true,
		})
		expect(harness.canvas.elementManager.delete).not.toHaveBeenCalled()
		expect(harness.elements.has(outputImage.id)).toBe(true)
		const shots = harness.updates[0]?.patch.shots as StoryboardElement["shots"]
		expect(shots?.map((shot) => shot.id)).toEqual(["shot-2"])

		manager.destroy()
	})

	it("keeps generation controls disabled and exposes not-allowed cursor", () => {
		const data = createStoryboardData()
		const harness = createCanvasMock(data)
		harness.selected.value = true
		const manager = new StoryboardInteractionManager({ canvas: harness.canvas })
		const hit = new Konva.Rect({ width: 100, height: 40 })
		const states: string[] = []
		manager.bindControl({
			elementId: data.id,
			node: hit,
			action: { type: "generate-all", disabled: true },
			applyState: (state) => states.push(state),
		})

		hit.fire("mouseenter", { evt: new MouseEvent("mouseenter") })
		hit.fire("mousedown", { evt: new MouseEvent("mousedown", { button: 0 }) })
		hit.fire("click", { evt: new MouseEvent("click", { button: 0 }) })

		expect(states.at(-1)).toBe("disabled")
		expect(harness.canvas.cursorManager.setTemporary).toHaveBeenCalledWith("not-allowed")
		manager.destroy()
	})

	it("normalizes an oversized storyboard height from its shot count", () => {
		const data = createStoryboardData()
		data.shots = Array.from({ length: 20 }, (_, index) => ({
			id: `shot-${index + 1}`,
			durationSeconds: 3,
			description: `镜头 ${index + 1}`,
		}))
		const harness = createCanvasMock(data)
		const manager = new StoryboardInteractionManager({ canvas: harness.canvas })

		const heightUpdate = harness.updates.find((update) => update.patch.height !== undefined)
		expect(heightUpdate?.patch.height).toBeGreaterThan(data.height)
		expect(heightUpdate?.patch).toEqual({ height: heightUpdate?.patch.height })

		manager.destroy()
	})

	it("keeps unsupported model parameters disabled instead of exposing hover or pointer", async () => {
		const data = createStoryboardData()
		data.generationConfig = { model_id: "text-only-size-model" }
		const harness = createCanvasMock(data)
		harness.selected.value = true
		const getImageModelList =
			harness.canvas.magicConfigManager.config?.methods?.getImageModelList
		if (!getImageModelList) throw new Error("Expected image model list mock")
		vi.mocked(getImageModelList).mockResolvedValue([
			{
				id: "text-only-size",
				group_id: "official",
				model_id: "text-only-size-model",
				model_name: "无尺寸配置模型",
				provider_model_id: "provider-model",
				model_description: "",
				model_icon: "",
				model_status: "normal",
				sort: 1,
			} as ImageModelItem,
		])

		const manager = new StoryboardInteractionManager({ canvas: harness.canvas })
		await vi.waitFor(() => expect(harness.rerender).toHaveBeenCalled())

		const aspectHit = new Konva.Rect({ width: 100, height: 40 })
		const resolutionHit = new Konva.Rect({ width: 100, height: 40 })
		const aspectStates: string[] = []
		const resolutionStates: string[] = []
		manager.bindControl({
			elementId: data.id,
			node: aspectHit,
			action: { type: "select-aspect-ratio" },
			applyState: (state) => aspectStates.push(state),
		})
		manager.bindControl({
			elementId: data.id,
			node: resolutionHit,
			action: { type: "select-resolution" },
			applyState: (state) => resolutionStates.push(state),
		})

		aspectHit.fire("mouseenter", { evt: new MouseEvent("mouseenter") })
		resolutionHit.fire("mouseenter", { evt: new MouseEvent("mouseenter") })
		aspectHit.fire("mousedown", { evt: new MouseEvent("mousedown", { button: 0 }) })
		resolutionHit.fire("mousedown", { evt: new MouseEvent("mousedown", { button: 0 }) })
		aspectHit.fire("click", { evt: new MouseEvent("click", { button: 0 }) })
		resolutionHit.fire("click", { evt: new MouseEvent("click", { button: 0 }) })

		expect(aspectStates.at(-1)).toBe("disabled")
		expect(resolutionStates.at(-1)).toBe("disabled")
		expect(harness.canvas.cursorManager.setTemporary).toHaveBeenCalledWith("not-allowed")
		expect(harness.container.querySelector("[data-storyboard-select-value]")).toBeNull()

		manager.destroy()
	})

	it("disables only resolution when the model exposes ratios without resolution scales", async () => {
		const data = createStoryboardData()
		data.generationConfig = { model_id: "ratio-only-model" }
		const harness = createCanvasMock(data)
		harness.selected.value = true
		const getImageModelList =
			harness.canvas.magicConfigManager.config?.methods?.getImageModelList
		if (!getImageModelList) throw new Error("Expected image model list mock")
		vi.mocked(getImageModelList).mockResolvedValue([
			{
				id: "ratio-only",
				group_id: "official",
				model_id: "ratio-only-model",
				model_name: "仅比例模型",
				provider_model_id: "provider-model",
				model_description: "",
				model_icon: "",
				model_status: "normal",
				sort: 1,
				image_size_config: {
					sizes: [{ label: "1:1", value: "1024x1024" }],
				},
			} as ImageModelItem,
		])

		const manager = new StoryboardInteractionManager({ canvas: harness.canvas })
		await vi.waitFor(() => expect(harness.rerender).toHaveBeenCalled())

		const aspectHit = new Konva.Rect({ width: 100, height: 40 })
		const resolutionHit = new Konva.Rect({ width: 100, height: 40 })
		const aspectStates: string[] = []
		const resolutionStates: string[] = []
		manager.bindControl({
			elementId: data.id,
			node: aspectHit,
			action: { type: "select-aspect-ratio" },
			applyState: (state) => aspectStates.push(state),
		})
		manager.bindControl({
			elementId: data.id,
			node: resolutionHit,
			action: { type: "select-resolution" },
			applyState: (state) => resolutionStates.push(state),
		})

		aspectHit.fire("mouseenter", { evt: new MouseEvent("mouseenter") })
		resolutionHit.fire("mouseenter", { evt: new MouseEvent("mouseenter") })

		expect(aspectStates.at(-1)).toBe("hover")
		expect(resolutionStates.at(-1)).toBe("disabled")
		expect(harness.canvas.cursorManager.setTemporary).toHaveBeenLastCalledWith("not-allowed")

		manager.destroy()
	})

	it("uses pressed then idle state for touch tap and cancels multi-touch activation", () => {
		const data = createStoryboardData()
		const harness = createCanvasMock(data)
		harness.selected.value = true
		harness.canvas.deviceInfo.input.touch = true
		harness.canvas.deviceInfo.input.coarsePointer = true
		harness.canvas.deviceInfo.input.hover = false
		const manager = new StoryboardInteractionManager({ canvas: harness.canvas })
		const hit = new Konva.Rect({ width: 44, height: 44 })
		const states: string[] = []
		manager.bindControl({
			elementId: data.id,
			node: hit,
			action: { type: "delete-shot", shotId: "shot-1" },
			applyState: (state) => states.push(state),
		})

		hit.fire("touchstart", { evt: createTouchEvent("touchstart", 2) })
		hit.fire("touchend", { evt: createTouchEvent("touchend", 0) })
		hit.fire("tap", { evt: createTouchEvent("touchend", 0) })
		expect(harness.updates).toHaveLength(0)

		hit.fire("touchstart", { evt: createTouchEvent("touchstart", 1) })
		expect(states.at(-1)).toBe("pressed")
		hit.fire("touchend", { evt: createTouchEvent("touchend", 0) })
		expect(states.at(-1)).toBe("idle")
		hit.fire("tap", { evt: createTouchEvent("touchend", 0) })

		expect(harness.updates).toHaveLength(1)
		expect(harness.updates[0].patch.shots).toEqual([])
		expect(states).not.toContain("hover")
		manager.destroy()
	})

	it("derives size and resolution from the selected image model and commits once", async () => {
		const data = createStoryboardData()
		data.generationConfig = {
			model_id: "old-model",
			size: "1080x1920",
			resolution: "1K",
			image_generation_config: { aspect_ratio: "9:16" },
		}
		const harness = createCanvasMock(data)
		harness.selected.value = true
		const models: ImageModelItem[] = [
			{
				id: "old",
				group_id: "official",
				model_id: "old-model",
				model_name: "旧模型",
				provider_model_id: "old-provider",
				model_description: "",
				model_icon: "",
				model_status: "normal",
				sort: 1,
				model_group: {
					id: "official-models",
					name: "官方模型",
					sort: 2,
					source: "official",
				},
				image_size_config: {
					default_scale: "1K",
					sizes: [{ label: "9:16", value: "1080x1920", scale: "1K" }],
				},
			},
			{
				id: "new",
				group_id: "official",
				model_id: "new-model",
				model_name: "新模型",
				provider_model_id: "new-provider",
				model_description: "",
				model_icon: "https://example.com/new-model.png",
				model_status: "normal",
				sort: 2,
				model_group: {
					id: "custom-models",
					name: "自定义模型",
					sort: 1,
					source: "custom",
				},
				image_size_config: {
					default_scale: "2K",
					image_settings: [
						{
							key: "image_generation_config.quality",
							label: "质量",
							description: "",
							component: "single_select",
							variant: "segmented",
							default: "unsupported-default",
							options: [{ label: "高", value: "high" }],
						},
					],
					sizes: [
						{ label: "1:1", value: "2048x2048", scale: "2K" },
						{ label: "9:16", value: "2160x3840", scale: "2K" },
					],
				},
			},
		]
		const getImageModelList =
			harness.canvas.magicConfigManager.config?.methods?.getImageModelList
		if (!getImageModelList) throw new Error("Expected image model list mock")
		vi.mocked(getImageModelList).mockResolvedValue(models)
		const manager = new StoryboardInteractionManager({ canvas: harness.canvas })
		await vi.waitFor(() => {
			expect(manager.getModelIcon("new-model")).toBe("https://example.com/new-model.png")
		})
		expect(harness.rerender).toHaveBeenCalledWith()

		const hit = new Konva.Rect({ width: 100, height: 40 })
		vi.spyOn(hit, "getStage").mockReturnValue({} as Konva.Stage)
		const anchorNode = {
			getStage: () => ({}),
			getAbsoluteTransform: () => ({ getMatrix: () => [1, 0, 0, 1, 10, 20] }),
			width: () => 240,
			height: () => 48,
		} as unknown as Konva.Node
		manager.bindControl({
			elementId: data.id,
			node: hit,
			overlayAnchorNode: anchorNode,
			selectPresentation: {
				fontSize: 22.5,
				horizontalPadding: 20,
				suffixGap: 10,
				suffixIconSize: 15,
				modelIconUrl: "https://example.com/new-model.png",
				modelIconSize: 18,
				modelIconGap: 8,
			},
			action: { type: "select-model" },
			applyState: vi.fn(),
		})

		hit.fire("mousedown", { evt: new MouseEvent("mousedown", { button: 0 }) })
		hit.fire("mouseup", { evt: new MouseEvent("mouseup", { button: 0 }) })
		hit.fire("click", { evt: new MouseEvent("click", { button: 0 }) })
		await vi.waitFor(() => {
			expect(harness.container.querySelector('button[aria-label="图片模型"]')).toBeTruthy()
		})
		const trigger = harness.container.querySelector<HTMLButtonElement>(
			'button[aria-label="图片模型"]',
		)
		const triggerValue = trigger?.querySelector<HTMLElement>("[data-storyboard-select-value]")
		const triggerSuffix = trigger?.querySelector<HTMLElement>("[data-storyboard-select-suffix]")
		const triggerModelIcon = trigger?.querySelector<HTMLElement>(
			"[data-storyboard-select-model-icon]",
		)
		expect(trigger?.style.getPropertyValue("--storyboard-select-font-size")).toBe("22.5px")
		expect(trigger?.style.getPropertyValue("--storyboard-select-horizontal-padding")).toBe(
			"20px",
		)
		expect(trigger?.style.getPropertyValue("--storyboard-select-suffix-gap")).toBe("10px")
		expect(trigger?.style.getPropertyValue("--storyboard-select-suffix-size")).toBe("15px")
		expect(trigger?.style.opacity).toBe("0")
		expect(triggerValue).toBeTruthy()
		expect(triggerSuffix).toBeTruthy()
		expect(triggerModelIcon?.getAttribute("src")).toBe("https://example.com/new-model.png")
		expect(trigger?.querySelectorAll("img")).toHaveLength(1)
		expect(trigger?.querySelectorAll("[data-storyboard-select-suffix]")).toHaveLength(1)
		expect(trigger?.querySelectorAll("svg")).toHaveLength(1)
		expect(
			Array.from(document.querySelectorAll("[data-storyboard-select-group-label]"), (node) =>
				node.textContent?.trim(),
			),
		).toEqual(["自定义模型", "官方模型"])

		await vi.waitFor(() => {
			expect(document.querySelector('[role="option"]')).toBeTruthy()
		})
		const option = Array.from(document.querySelectorAll('[role="option"]')).find((item) =>
			item.textContent?.includes("新模型"),
		)
		if (!option) throw new Error("Expected model select option")
		expect(option.getAttribute("data-storyboard-option-icon")).toBeNull()
		option.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }))
		option.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }))
		option.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }))
		await vi.waitFor(() => {
			expect(harness.updates).toHaveLength(1)
		})

		expect(harness.updates).toHaveLength(1)
		expect(harness.updates[0]).toEqual({
			id: data.id,
			patch: {
				generationConfig: {
					model_id: "new-model",
					size: "2160x3840",
					resolution: "2K",
					image_generation_config: { quality: "high", aspect_ratio: "9:16" },
				},
			},
		})
		manager.destroy()
	})

	it("renders aspect ratio options with the image editor preview and dimensions", async () => {
		const data = createStoryboardData()
		data.generationConfig = {
			model_id: "seedream-model",
			size: "2048x2048",
			resolution: "2K",
			image_generation_config: { aspect_ratio: "1:1" },
		}
		const harness = createCanvasMock(data)
		harness.selected.value = true
		const getImageModelList =
			harness.canvas.magicConfigManager.config?.methods?.getImageModelList
		if (!getImageModelList) throw new Error("Expected image model list mock")
		vi.mocked(getImageModelList).mockResolvedValue([
			{
				id: "seedream",
				group_id: "official",
				model_id: "seedream-model",
				model_name: "Seedream",
				provider_model_id: "seedream-provider",
				model_description: "",
				model_icon: "",
				model_status: "normal",
				sort: 1,
				image_size_config: {
					default_scale: "2K",
					sizes: [
						{ label: "1:1", value: "2048x2048", scale: "2K" },
						{ label: "3:4", value: "1792x2400", scale: "2K" },
					],
				},
			},
		])
		const manager = new StoryboardInteractionManager({ canvas: harness.canvas })
		await vi.waitFor(() => expect(harness.rerender).toHaveBeenCalled())

		const hit = new Konva.Rect({ width: 100, height: 40 })
		vi.spyOn(hit, "getStage").mockReturnValue({} as Konva.Stage)
		const anchorNode = {
			getStage: () => ({}),
			getAbsoluteTransform: () => ({ getMatrix: () => [1, 0, 0, 1, 10, 20] }),
			width: () => 240,
			height: () => 48,
		} as unknown as Konva.Node
		manager.bindControl({
			elementId: data.id,
			node: hit,
			overlayAnchorNode: anchorNode,
			action: { type: "select-aspect-ratio" },
			applyState: vi.fn(),
		})

		hit.fire("mousedown", { evt: new MouseEvent("mousedown", { button: 0 }) })
		hit.fire("mouseup", { evt: new MouseEvent("mouseup", { button: 0 }) })
		hit.fire("click", { evt: new MouseEvent("click", { button: 0 }) })
		await vi.waitFor(() => {
			expect(harness.container.querySelector('button[aria-label="画面比例"]')).toBeTruthy()
		})
		const option = Array.from(
			document.querySelectorAll('[role="option"][data-storyboard-option-size="true"]'),
		).find((item) => item.textContent?.includes("1:1"))
		if (!option) throw new Error("Expected aspect ratio option")
		expect(
			Array.from(document.querySelectorAll('[role="option"]')).every(
				(item) => item.getAttribute("data-storyboard-option-size") === "true",
			),
		).toBe(true)
		const label = option.querySelector<HTMLElement>("[data-storyboard-option-secondary]")
		expect(option.getAttribute("data-storyboard-option-size")).toBe("true")
		expect(option.style.getPropertyValue("--storyboard-option-preview-width")).toBe("16px")
		expect(option.style.getPropertyValue("--storyboard-option-preview-height")).toBe("16px")
		expect(label?.getAttribute("data-storyboard-option-secondary")).toBe("2048x2048")

		manager.destroy()
	})
})
