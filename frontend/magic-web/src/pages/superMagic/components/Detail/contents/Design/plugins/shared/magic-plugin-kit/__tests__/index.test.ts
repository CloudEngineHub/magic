import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const runtimePath = resolve(
	process.cwd(),
	"src/pages/superMagic/components/Detail/contents/Design/plugins/shared/magic-plugin-kit/index.js",
)
const runtimeCode = readFileSync(runtimePath, "utf8")
type MagicPluginKitWindow = Window & {
	MagicPluginKit?: {
		createPanelState: (
			ctx: unknown,
			initialState?: Record<string, unknown>,
		) => Record<string, unknown>
		render: (
			ctx: unknown,
			root: HTMLElement,
			config: Record<string, unknown>,
		) => {
			elements?: {
				root?: HTMLElement
				panel?: HTMLElement | null
				content?: HTMLElement | null
				footer?: HTMLElement | null
				slots?: Record<string, HTMLElement>
			}
			update?: (change: { keys?: Set<string> }) => void
			dispose?: () => void
		}
		mount: (
			ctx: unknown,
			root: HTMLElement,
			config: Record<string, unknown>,
		) => (() => void) | void
	}
}

function loadMagicPluginKit() {
	const runtimeWindow = window as MagicPluginKitWindow
	Reflect.deleteProperty(runtimeWindow, "MagicPluginKit")
	const runRuntime = new Function("window", "document", "requestAnimationFrame", runtimeCode)
	runRuntime(runtimeWindow, document, requestAnimationFrame)
	if (!runtimeWindow.MagicPluginKit) {
		throw new Error("MagicPluginKit runtime did not initialize.")
	}
	return runtimeWindow.MagicPluginKit
}

function createCtx(pickFiles = vi.fn().mockResolvedValue([])) {
	return {
		i18n: {
			t: (_key: string, fallback?: string) => fallback ?? "",
		},
		ui: {
			setHeight: vi.fn(),
			toast: vi.fn(),
			close: vi.fn(),
		},
		assets: {
			pickFiles,
		},
		ai: {},
	}
}

function createCtxWithExternalState() {
	const ctx = createCtx()
	return {
		...ctx,
		state: {
			create: vi.fn((initialState = {}) => ({ ...initialState })),
			patch: vi.fn((state: Record<string, unknown>, patch: Record<string, unknown>) => {
				Object.assign(state, patch)
				return state
			}),
		},
	}
}

function createGenerateConfig() {
	return {
		buttonLabel: "Generate",
		loadingLabel: "Generating",
		isDisabled: () => false,
		validate: () => null,
		buildRequest: () => ({}),
	}
}

function createRoot() {
	const root = document.createElement("div")
	document.body.append(root)
	return root
}

function createModel() {
	return {
		model_id: "model-a",
		model_name: "Model A",
		image_size_config: {
			default_scale: "1K",
			max_output_images: 4,
			sizes: [
				{ label: "1:1", value: "1024x1024", scale: "1K" },
				{ label: "1:1", value: "2048x2048", scale: "2K" },
				{ label: "3:4", value: "1152x1536", scale: "1K" },
				{ label: "3:4", value: "2304x3072", scale: "2K" },
			],
		},
	}
}

function installMaskPainterDomMocks() {
	const originalImage = window.Image
	const originalGlobalImage = globalThis.Image
	const originalWindowURL = window.URL
	const originalGlobalURL = globalThis.URL
	const originalGetContext = HTMLCanvasElement.prototype.getContext
	const originalToBlob = HTMLCanvasElement.prototype.toBlob
	const originalToDataURL = HTMLCanvasElement.prototype.toDataURL
	const canvasStates = new WeakMap<HTMLCanvasElement, { context: any; hasMask: boolean }>()
	const contexts: any[] = []

	class MockImage {
		onload: null | (() => void) = null
		onerror: null | (() => void) = null
		naturalWidth = 100
		naturalHeight = 100
		private source = ""

		set src(value: string) {
			this.source = value
			queueMicrotask(() => this.onload?.())
		}

		get src() {
			return this.source
		}
	}

	class MockURL extends originalGlobalURL {}
	Object.defineProperty(MockURL, "createObjectURL", {
		configurable: true,
		value: vi.fn(() => "blob:mock"),
	})
	Object.defineProperty(MockURL, "revokeObjectURL", {
		configurable: true,
		value: vi.fn(),
	})

	function getCanvasState(canvas: HTMLCanvasElement) {
		let state = canvasStates.get(canvas)
		if (state) return state

		state = {
			hasMask: false,
			context: null,
		}
		const context = {
			fillStyle: "",
			strokeStyle: "",
			lineWidth: 0,
			globalCompositeOperation: "source-over",
			clearRect: vi.fn(),
			drawImage: vi.fn((source: unknown) => {
				if (source instanceof HTMLCanvasElement) {
					const sourceState = canvasStates.get(source)
					if (sourceState?.hasMask) state.hasMask = true
				}
			}),
			save: vi.fn(),
			restore: vi.fn(),
			beginPath: vi.fn(),
			arc: vi.fn(),
			stroke: vi.fn(),
			putImageData: vi.fn(),
			fillRect: vi.fn(function (this: { fillStyle: string }) {
				if (this.fillStyle === "#000000") state.hasMask = false
				if (this.fillStyle === "#ffffff") state.hasMask = true
			}),
			fill: vi.fn(function (this: { fillStyle: string }) {
				if (this.fillStyle === "#ffffff") state.hasMask = true
			}),
			createImageData: vi.fn((width: number, height: number) => ({
				data: new Uint8ClampedArray(width * height * 4),
			})),
			getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => {
				const data = new Uint8ClampedArray(width * height * 4)
				if (state.hasMask) {
					data[0] = 255
					data[3] = 255
				}
				return { data }
			}),
		}
		state.context = context
		canvasStates.set(canvas, state)
		contexts.push(context)
		return state
	}

	Object.defineProperty(window, "Image", {
		configurable: true,
		writable: true,
		value: MockImage,
	})
	Object.defineProperty(globalThis, "Image", {
		configurable: true,
		writable: true,
		value: MockImage,
	})
	Object.defineProperty(window, "URL", {
		configurable: true,
		writable: true,
		value: MockURL,
	})
	Object.defineProperty(globalThis, "URL", {
		configurable: true,
		writable: true,
		value: MockURL,
	})
	Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
		configurable: true,
		value: function (this: HTMLCanvasElement) {
			return getCanvasState(this).context
		},
	})
	Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
		configurable: true,
		value: function (callback: BlobCallback) {
			callback(new Blob(["crop"], { type: "image/png" }))
		},
	})
	Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
		configurable: true,
		value: vi.fn(() => "data:image/png;base64,mask-preview"),
	})

	return Object.assign(
		() => {
			Object.defineProperty(window, "Image", {
				configurable: true,
				writable: true,
				value: originalImage,
			})
			Object.defineProperty(globalThis, "Image", {
				configurable: true,
				writable: true,
				value: originalGlobalImage,
			})
			Object.defineProperty(window, "URL", {
				configurable: true,
				writable: true,
				value: originalWindowURL,
			})
			Object.defineProperty(globalThis, "URL", {
				configurable: true,
				writable: true,
				value: originalGlobalURL,
			})
			Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
				configurable: true,
				value: originalGetContext,
			})
			Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
				configurable: true,
				value: originalToBlob,
			})
			Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
				configurable: true,
				value: originalToDataURL,
			})
		},
		{ contexts },
	)
}

function setCanvasClientRect(canvas: HTMLCanvasElement, width = 100, height = 100) {
	Object.defineProperty(canvas, "getBoundingClientRect", {
		configurable: true,
		value: () => ({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: width,
			bottom: height,
			width,
			height,
			toJSON: () => ({}),
		}),
	})
}

describe("magic-plugin-kit", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		document.body.innerHTML = ""
	})

	it("returns a view controller from render and cleans up through dispose", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		const view = kit.render(ctx, root, {
			sections: [],
			generate: createGenerateConfig(),
		})

		expect(root.querySelector(".mpk-panel")).toBeTruthy()
		view.dispose?.()
		expect(root.children).toHaveLength(0)
	})

	it("requests the default panel height while allowing the panel to track the iframe viewport", async () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.render(ctx, root, {
			sections: [],
			generate: createGenerateConfig(),
		})

		expect(root.querySelector(".mpk-panel")).toBeTruthy()
		await vi.waitFor(() => {
			expect(ctx.ui.setHeight).toHaveBeenCalledWith(640)
		})
	})

	it("can render externally owned ctx.state and update through the view controller", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtxWithExternalState()
		const state = kit.createPanelState(ctx, {
			mode: "fast",
		})

		const view = kit.render(ctx, root, {
			state,
			sections: [
				{
					id: "mode",
					kind: "option-group",
					stateKey: "mode",
					title: "Mode",
					options: [
						{ value: "fast", label: "Fast" },
						{ value: "pro", label: "Pro" },
					],
				},
			],
			generate: createGenerateConfig(),
		})

		const initialButtons = root.querySelectorAll<HTMLButtonElement>(".mpk-option")
		expect(ctx.state.create).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: "fast",
			}),
		)
		expect(initialButtons[0]?.classList.contains("is-active")).toBe(true)
		expect(initialButtons[1]?.classList.contains("is-active")).toBe(false)

		ctx.state.patch(state, { mode: "pro" })
		view.update?.({ keys: new Set(["mode"]) })

		const nextButtons = root.querySelectorAll<HTMLButtonElement>(".mpk-option")
		expect(nextButtons[0]?.classList.contains("is-active")).toBe(false)
		expect(nextButtons[1]?.classList.contains("is-active")).toBe(true)
	})

	it("passes stable DOM elements to custom section render callbacks", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		const seenPanels: unknown[] = []

		const view = kit.render(ctx, root, {
			sections: [
				{
					id: "custom",
					kind: "custom",
					render: ({ elements }: { elements: { panel: HTMLElement | null } }) => {
						seenPanels.push(elements.panel)
						const node = document.createElement("div")
						node.className = "custom-node"
						return node
					},
				},
			],
			generate: createGenerateConfig(),
		})

		expect(seenPanels).toEqual([root.querySelector(".mpk-panel")])
		expect(view.elements?.panel).toBe(root.querySelector(".mpk-panel"))
		expect(view.elements?.root).toBe(root)
	})

	it("keeps mount as a cleanup-function compatibility wrapper", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		const cleanup = kit.mount(ctx, root, {
			sections: [],
			generate: createGenerateConfig(),
		})

		expect(root.querySelector(".mpk-panel")).toBeTruthy()
		cleanup?.()
		expect(root.children).toHaveLength(0)
	})

	it("re-renders only sections affected by the patch", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {
				mode: "fast",
				genCount: 1,
			},
			sections: [
				{
					id: "mode",
					kind: "option-group",
					stateKey: "mode",
					title: "Mode",
					options: [
						{ value: "fast", label: "Fast" },
						{ value: "pro", label: "Pro" },
					],
				},
				{
					id: "count",
					kind: "option-group",
					stateKey: "genCount",
					title: "Count",
					options: [1, 2, 3].map((count) => ({
						value: count,
						label: String(count),
					})),
				},
			],
			generate: createGenerateConfig(),
		})

		const slots = root.querySelectorAll(".mpk-content > .mpk-slot")
		const modeSlot = slots[0]
		const countSlot = slots[1]
		const initialModeSection = modeSlot.firstElementChild
		const initialCountSection = countSlot.firstElementChild

		const modeButtons = modeSlot.querySelectorAll<HTMLButtonElement>(".mpk-option")
		modeButtons[1].click()

		expect(modeSlot.firstElementChild).not.toBe(initialModeSection)
		expect(countSlot.firstElementChild).toBe(initialCountSection)
	})

	it("reuses existing image card DOM nodes when adding and removing assets", async () => {
		const assetA = {
			id: "asset-a",
			path: "uploads/a.png",
			url: "https://example.com/a.png",
			src: "https://example.com/a.png",
			fileName: "a.png",
			type: "image",
		}
		const assetB = {
			id: "asset-b",
			path: "uploads/b.png",
			url: "https://example.com/b.png",
			src: "https://example.com/b.png",
			fileName: "b.png",
			type: "image",
		}
		const pickFiles = vi.fn().mockResolvedValue([assetB])
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx(pickFiles)

		kit.mount(ctx, root, {
			initialState: {
				productImages: [assetA],
			},
			sections: [
				{
					id: "productImages",
					kind: "image-grid",
					stateKey: "productImages",
					title: "Products",
					maxCount: 3,
				},
			],
			generate: createGenerateConfig(),
		})

		const imageSlot = root.querySelectorAll(".mpk-content > .mpk-slot")[0]
		const initialFirstCard = imageSlot.querySelector(".mpk-image-card")
		const addButton = imageSlot.querySelector<HTMLButtonElement>(".mpk-add-button")
		addButton?.click()
		await vi.waitFor(() => {
			expect(imageSlot.querySelectorAll(".mpk-image-card")).toHaveLength(2)
		})

		let cards = imageSlot.querySelectorAll(".mpk-image-card")
		expect(cards[0]).toBe(initialFirstCard)

		const secondCardRemoveButton =
			cards[1].querySelector<HTMLButtonElement>(".mpk-remove-button")
		secondCardRemoveButton?.click()
		await vi.waitFor(() => {
			expect(imageSlot.querySelectorAll(".mpk-image-card")).toHaveLength(1)
		})

		cards = imageSlot.querySelectorAll(".mpk-image-card")
		expect(cards[0]).toBe(initialFirstCard)
	})

	function createImagePasteData(filename = "image.png") {
		const blobFile = new File([new Uint8Array([137, 80, 78, 71])], filename, {
			type: "image/png",
		})
		return {
			files: [blobFile],
			items: [
				{
					kind: "file",
					type: "image/png",
					getAsFile: () => blobFile,
				},
			],
			types: ["Files"],
		}
	}

	function dispatchPaste(
		target: Element,
		clipboardData: { files: File[]; items: unknown[]; types: string[] },
	) {
		const event = new Event("paste", { bubbles: true, cancelable: true })
		Object.defineProperty(event, "clipboardData", {
			value: clipboardData,
			configurable: true,
		})
		target.dispatchEvent(event)
	}

	function dispatchEmptyPaste(target: Element) {
		dispatchPaste(target, {
			files: [],
			items: [],
			types: [],
		})
	}

	it("reads canvas clipboard through host bridge when paste event has no files", async () => {
		const existingPath = "uploads/canvas-image.png"
		const resolvedAsset = {
			id: existingPath,
			path: existingPath,
			url: "https://example.com/canvas-image.png",
			src: "https://example.com/canvas-image.png",
			fileName: "canvas-image.png",
			type: "image",
		}
		const uploadFile = vi.fn()
		const resolveFileAssets = vi.fn().mockResolvedValue([resolvedAsset])
		const readCanvasClipboard = vi.fn().mockResolvedValue({
			payload: {
				source: "canvas-design",
				version: 1,
				operation: "copy-elements",
				files: [
					{
						id: "file-1",
						elementId: "element-1",
						filename: "canvas-image.png",
						mimeType: "image/png",
						fileSize: 0,
						role: "element-media",
						sourceRef: { src: existingPath },
					},
				],
			},
			uploadedAssets: [],
		})
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		ctx.assets.uploadFile = uploadFile
		ctx.assets.resolveFileAssets = resolveFileAssets
		ctx.assets.readCanvasClipboard = readCanvasClipboard

		kit.mount(ctx, root, {
			initialState: {
				productImages: [],
			},
			sections: [
				{
					id: "productImages",
					kind: "image-grid",
					stateKey: "productImages",
					title: "Products",
					maxCount: 3,
				},
			],
			generate: createGenerateConfig(),
		})

		const grid = root.querySelector(".mpk-image-grid")
		expect(grid).not.toBeNull()
		dispatchEmptyPaste(grid!)

		await vi.waitFor(() => {
			expect(readCanvasClipboard).toHaveBeenCalledTimes(1)
			expect(resolveFileAssets).toHaveBeenCalledWith(
				[{ path: existingPath, fileName: "canvas-image.png" }],
				{ type: "image" },
			)
			expect(uploadFile).not.toHaveBeenCalled()
		})
	})

	it("uploads standard image files from paste event", async () => {
		const uploadedAsset = {
			id: "uploads/export.png",
			path: "uploads/export.png",
			url: "https://example.com/export.png",
			src: "https://example.com/export.png",
			fileName: "export.png",
			type: "image",
		}
		const uploadFile = vi.fn().mockResolvedValue(uploadedAsset)
		const resolveFileAssets = vi.fn()
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		ctx.assets.uploadFile = uploadFile
		ctx.assets.resolveFileAssets = resolveFileAssets

		kit.mount(ctx, root, {
			initialState: {
				referenceImage: null,
			},
			sections: [
				{
					id: "referenceImage",
					kind: "image-slot",
					stateKey: "referenceImage",
					title: "Reference",
				},
			],
			generate: createGenerateConfig(),
		})

		const uploadTarget = root.querySelector(".mpk-image-slot-upload")
		expect(uploadTarget).not.toBeNull()
		dispatchPaste(uploadTarget!, createImagePasteData("export.png"))

		await vi.waitFor(() => {
			expect(uploadFile).toHaveBeenCalledTimes(1)
			expect(resolveFileAssets).not.toHaveBeenCalled()
		})
	})

	it("shows a pasting toast while paste import is in progress", async () => {
		let resolveUpload: (value: unknown) => void = () => {}
		const uploadFile = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveUpload = resolve
				}),
		)
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		ctx.assets.uploadFile = uploadFile

		kit.mount(ctx, root, {
			initialState: {
				referenceImage: null,
			},
			sections: [
				{
					id: "referenceImage",
					kind: "image-slot",
					stateKey: "referenceImage",
					title: "Reference",
				},
			],
			generate: createGenerateConfig(),
		})

		const uploadTarget = root.querySelector(".mpk-image-slot-upload")
		expect(uploadTarget).not.toBeNull()
		dispatchPaste(uploadTarget!, createImagePasteData("export.png"))

		await vi.waitFor(() => {
			expect(ctx.ui.toast).toHaveBeenCalledWith("正在粘贴…", "info")
		})

		resolveUpload({
			id: "uploads/export.png",
			path: "uploads/export.png",
			url: "https://example.com/export.png",
			src: "https://example.com/export.png",
			fileName: "export.png",
			type: "image",
		})

		await vi.waitFor(() => {
			expect(uploadFile).toHaveBeenCalledTimes(1)
		})
	})

	it("shows an error toast when paste upload fails", async () => {
		const uploadFile = vi.fn().mockRejectedValue(new Error("upload failed"))
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		ctx.assets.uploadFile = uploadFile

		kit.mount(ctx, root, {
			initialState: {
				referenceImage: null,
			},
			sections: [
				{
					id: "referenceImage",
					kind: "image-slot",
					stateKey: "referenceImage",
					title: "Reference",
				},
			],
			generate: createGenerateConfig(),
		})

		const uploadTarget = root.querySelector(".mpk-image-slot-upload")
		expect(uploadTarget).not.toBeNull()
		dispatchPaste(uploadTarget!, createImagePasteData("export.png"))

		await vi.waitFor(() => {
			expect(ctx.ui.toast).toHaveBeenCalledWith("upload failed", "error")
		})
	})

	it("shows an error toast when canvas clipboard resolve fails", async () => {
		const resolveFileAssets = vi.fn().mockRejectedValue(new Error("resolve failed"))
		const readCanvasClipboard = vi.fn().mockResolvedValue({
			payload: {
				source: "canvas-design",
				version: 1,
				operation: "copy-elements",
				files: [
					{
						id: "file-1",
						elementId: "element-1",
						filename: "canvas-image.png",
						mimeType: "image/png",
						fileSize: 0,
						role: "element-media",
						sourceRef: { src: "uploads/canvas-image.png" },
					},
				],
			},
			uploadedAssets: [],
		})
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		ctx.assets.resolveFileAssets = resolveFileAssets
		ctx.assets.readCanvasClipboard = readCanvasClipboard

		kit.mount(ctx, root, {
			initialState: {
				productImages: [],
			},
			sections: [
				{
					id: "productImages",
					kind: "image-grid",
					stateKey: "productImages",
					title: "Products",
					maxCount: 3,
				},
			],
			generate: createGenerateConfig(),
		})

		const grid = root.querySelector(".mpk-image-grid")
		expect(grid).not.toBeNull()
		dispatchEmptyPaste(grid!)

		await vi.waitFor(() => {
			expect(resolveFileAssets).toHaveBeenCalledWith(
				[{ path: "uploads/canvas-image.png", fileName: "canvas-image.png" }],
				{ type: "image" },
			)
			expect(ctx.ui.toast).toHaveBeenCalledWith("resolve failed", "error")
		})
	})

	it("does not toast or import when canvas clipboard is empty", async () => {
		const readCanvasClipboard = vi.fn().mockResolvedValue({
			payload: null,
			uploadedAssets: [],
		})
		const resolveFileAssets = vi.fn()
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		ctx.assets.readCanvasClipboard = readCanvasClipboard
		ctx.assets.resolveFileAssets = resolveFileAssets

		kit.mount(ctx, root, {
			initialState: {
				productImages: [],
			},
			sections: [
				{
					id: "productImages",
					kind: "image-grid",
					stateKey: "productImages",
					title: "Products",
					maxCount: 3,
				},
			],
			generate: createGenerateConfig(),
		})

		const grid = root.querySelector(".mpk-image-grid")
		expect(grid).not.toBeNull()
		dispatchEmptyPaste(grid!)

		await vi.waitFor(() => {
			expect(readCanvasClipboard).toHaveBeenCalledTimes(1)
		})

		expect(resolveFileAssets).not.toHaveBeenCalled()
		expect(ctx.ui.toast).not.toHaveBeenCalled()
	})

	it("shows an error toast when canvas clipboard read fails", async () => {
		const readCanvasClipboard = vi.fn().mockRejectedValue(new Error("clipboard denied"))
		const resolveFileAssets = vi.fn()
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		ctx.assets.readCanvasClipboard = readCanvasClipboard
		ctx.assets.resolveFileAssets = resolveFileAssets

		kit.mount(ctx, root, {
			initialState: {
				productImages: [],
			},
			sections: [
				{
					id: "productImages",
					kind: "image-grid",
					stateKey: "productImages",
					title: "Products",
					maxCount: 3,
				},
			],
			generate: createGenerateConfig(),
		})

		const grid = root.querySelector(".mpk-image-grid")
		expect(grid).not.toBeNull()
		dispatchEmptyPaste(grid!)

		await vi.waitFor(() => {
			expect(readCanvasClipboard).toHaveBeenCalledTimes(1)
			expect(ctx.ui.toast).toHaveBeenCalledWith("clipboard denied", "error")
		})

		expect(resolveFileAssets).not.toHaveBeenCalled()
	})

	it("uses native title by default and renders tooltip DOM when hover descriptions are enabled", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {
				defaultMode: "fast",
				hoverMode: "fast",
			},
			sections: [
				{
					id: "defaultMode",
					kind: "option-group",
					stateKey: "defaultMode",
					title: "Default mode",
					options: [
						{ value: "fast", label: "Fast", description: "Default hidden description" },
					],
				},
				{
					id: "hoverMode",
					kind: "option-group",
					stateKey: "hoverMode",
					title: "Hover mode",
					showDescriptionOnHover: true,
					options: [{ value: "fast", label: "Fast", description: "Shown on hover" }],
				},
			],
			generate: createGenerateConfig(),
		})

		const slots = root.querySelectorAll(".mpk-content > .mpk-slot")
		const defaultButton = slots[0].querySelector<HTMLButtonElement>(".mpk-option")
		const hoverButton = slots[1].querySelector<HTMLButtonElement>(".mpk-option")
		const defaultTooltip = slots[0].querySelector(".mpk-option-tooltip")
		const hoverTooltip = slots[1].querySelector<HTMLElement>(".mpk-option-tooltip")

		expect(defaultButton?.title).toBe("Default hidden description")
		expect(defaultTooltip).toBeNull()
		expect(hoverButton?.title).toBe("")
		expect(hoverTooltip?.textContent).toBe("Shown on hover")
	})

	it("re-evaluates generate button disabled state when textarea input changes", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {
				brandName: "",
			},
			sections: [
				{
					id: "brandName",
					kind: "textarea",
					stateKey: "brandName",
					title: "Brand name",
					required: true,
				},
			],
			generate: {
				...createGenerateConfig(),
				isDisabled: ({ state }: { state: Record<string, unknown> }) =>
					!String(state.brandName ?? "").trim(),
			},
		})

		const textarea = root.querySelector<HTMLTextAreaElement>(".mpk-textarea")
		const generateButton = root.querySelector<HTMLButtonElement>(".mpk-generate")

		expect(generateButton?.disabled).toBe(true)

		textarea!.value = "Gucci"
		textarea!.dispatchEvent(new Event("input", { bubbles: true }))

		expect(root.querySelector<HTMLButtonElement>(".mpk-generate")).toBe(generateButton)
		expect(generateButton?.disabled).toBe(false)
	})

	it("keeps textarea typing local while clamping text by maxLength", () => {
		vi.useFakeTimers()
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {
				backgroundPrompt: "",
				genCount: 1,
			},
			sections: [
				{
					id: "backgroundPrompt",
					kind: "textarea",
					stateKey: "backgroundPrompt",
					title: "Prompt",
					maxLength: 5,
				},
				{
					id: "count",
					kind: "option-group",
					stateKey: "genCount",
					title: "Count",
					options: [{ value: 1, label: "1" }],
				},
			],
			generate: createGenerateConfig(),
		})

		const slots = root.querySelectorAll(".mpk-content > .mpk-slot")
		const promptSlot = slots[0]
		const countSlot = slots[1]
		const initialPromptSection = promptSlot.firstElementChild
		const initialCountSection = countSlot.firstElementChild
		const textarea = promptSlot.querySelector<HTMLTextAreaElement>(".mpk-textarea")
		textarea!.value = "1234567"
		textarea!.dispatchEvent(new Event("input", { bubbles: true }))

		expect(promptSlot.firstElementChild).toBe(initialPromptSection)
		expect(countSlot.firstElementChild).toBe(initialCountSection)
		expect(textarea?.value).toBe("12345")
		expect(promptSlot.querySelector(".mpk-textarea-count")?.textContent).toBe("5 / 5")

		vi.advanceTimersByTime(120)

		expect(promptSlot.firstElementChild).toBe(initialPromptSection)
		expect(countSlot.firstElementChild).toBe(initialCountSection)

		vi.useRealTimers()
	})

	it("renders card-style option-group with inline descriptions", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {
				backgroundMode: "image",
			},
			sections: [
				{
					id: "backgroundMode",
					kind: "option-group",
					stateKey: "backgroundMode",
					title: "Background",
					variant: "card",
					descriptionMode: "inline",
					options: [
						{ value: "image", label: "Image", description: "Pick a background" },
						{ value: "prompt", label: "Prompt", description: "Generate with text" },
					],
				},
			],
			generate: createGenerateConfig(),
		})

		const buttons = root.querySelectorAll<HTMLButtonElement>(".mpk-card-tab")
		const descriptions = root.querySelectorAll(".mpk-card-tab-description")
		expect(buttons[0].classList.contains("is-active")).toBe(true)
		expect(buttons[1].classList.contains("is-active")).toBe(false)
		expect(descriptions).toHaveLength(2)
		expect(descriptions[0]?.textContent).toBe("Pick a background")
		expect(descriptions[1]?.textContent).toBe("Generate with text")
		buttons[1].click()
		const nextButtons = root.querySelectorAll<HTMLButtonElement>(".mpk-card-tab")
		expect(nextButtons[0].classList.contains("is-active")).toBe(false)
		expect(nextButtons[1].classList.contains("is-active")).toBe(true)
	})

	it("supports multiple option-group selection and deselectable single options", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {
				changeItems: [],
				faceShape: "",
			},
			sections: [
				{
					id: "changeItems",
					kind: "option-group",
					stateKey: "changeItems",
					title: "Change items",
					required: true,
					multiple: true,
					options: [
						{ value: "hair", label: "Hair" },
						{ value: "face", label: "Face" },
					],
				},
				{
					id: "faceShape",
					kind: "option-group",
					stateKey: "faceShape",
					title: "Face shape",
					allowDeselect: true,
					options: [
						{ value: "oval", label: "Oval" },
						{ value: "round", label: "Round" },
					],
				},
			],
			generate: createGenerateConfig(),
		})

		expect(root.querySelector(".mpk-section-required")?.textContent).toBe("必填")

		const slots = root.querySelectorAll(".mpk-content > .mpk-slot")
		const multipleButtons = slots[0].querySelectorAll<HTMLButtonElement>(".mpk-option")
		multipleButtons[0].click()
		multipleButtons[1].click()

		let nextMultipleButtons = slots[0].querySelectorAll<HTMLButtonElement>(".mpk-option")
		expect(nextMultipleButtons[0].classList.contains("is-active")).toBe(true)
		expect(nextMultipleButtons[1].classList.contains("is-active")).toBe(true)

		nextMultipleButtons[0].click()
		nextMultipleButtons = slots[0].querySelectorAll<HTMLButtonElement>(".mpk-option")
		expect(nextMultipleButtons[0].classList.contains("is-active")).toBe(false)
		expect(nextMultipleButtons[1].classList.contains("is-active")).toBe(true)

		const singleButtons = slots[1].querySelectorAll<HTMLButtonElement>(".mpk-option")
		expect(singleButtons[0].classList.contains("is-active")).toBe(false)
		singleButtons[0].click()
		let nextSingleButtons = slots[1].querySelectorAll<HTMLButtonElement>(".mpk-option")
		expect(nextSingleButtons[0].classList.contains("is-active")).toBe(true)
		nextSingleButtons[0].click()
		nextSingleButtons = slots[1].querySelectorAll<HTMLButtonElement>(".mpk-option")
		expect(nextSingleButtons[0].classList.contains("is-active")).toBe(false)
	})

	it("passes the selected state to patchOnSelect callbacks", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		const tabStates: unknown[] = []
		const optionStates: unknown[] = []

		kit.mount(ctx, root, {
			initialState: {
				mode: "image",
				style: "",
			},
			sections: [
				{
					id: "mode",
					kind: "tabs",
					stateKey: "mode",
					title: "Mode",
					options: [
						{ value: "image", label: "Image" },
						{ value: "prompt", label: "Prompt" },
					],
					patchOnSelect: (
						_value: string,
						{ state }: { state: Record<string, unknown> },
					) => {
						tabStates.push(state.mode)
						return {}
					},
				},
				{
					id: "style",
					kind: "option-group",
					stateKey: "style",
					title: "Style",
					options: [
						{ value: "clean", label: "Clean" },
						{ value: "bold", label: "Bold" },
					],
					patchOnSelect: (
						_value: string,
						{ state }: { state: Record<string, unknown> },
					) => {
						optionStates.push(state.style)
						return {}
					},
				},
			],
			generate: createGenerateConfig(),
		})

		root.querySelectorAll<HTMLButtonElement>(".mpk-tabs-trigger")[1].click()
		root.querySelectorAll<HTMLButtonElement>(".mpk-option")[1].click()

		expect(tabStates).toEqual(["prompt"])
		expect(optionStates).toEqual(["bold"])
	})

	it("renders tabs panels and switches visible content", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {
				backgroundMode: "image",
			},
			sections: [
				{
					id: "backgroundMode",
					kind: "tabs",
					stateKey: "backgroundMode",
					title: "Background",
					options: [
						{ value: "image", label: "Reference image" },
						{ value: "prompt", label: "Text background" },
					],
					panels: [
						{
							value: "image",
							sections: [
								{
									id: "backgroundImage",
									kind: "image-slot",
									stateKey: "backgroundImage",
									title: "Background image",
									uploadLabel: "Upload background",
								},
							],
						},
						{
							value: "prompt",
							sections: [
								{
									id: "backgroundPrompt",
									kind: "textarea",
									stateKey: "backgroundPrompt",
									title: "Background prompt",
								},
							],
						},
					],
				},
			],
			generate: createGenerateConfig(),
		})

		const triggers = root.querySelectorAll<HTMLButtonElement>(".mpk-tabs-trigger")
		expect(triggers).toHaveLength(2)
		expect(triggers[0].classList.contains("is-active")).toBe(true)
		expect(root.textContent).toContain("Upload background")
		expect(root.textContent).not.toContain("Background prompt")

		triggers[1].click()

		const nextTriggers = root.querySelectorAll<HTMLButtonElement>(".mpk-tabs-trigger")
		expect(nextTriggers[0].classList.contains("is-active")).toBe(false)
		expect(nextTriggers[1].classList.contains("is-active")).toBe(true)
		expect(root.textContent).toContain("Background prompt")
		expect(root.textContent).not.toContain("Upload background")
	})

	it("renders textarea aiGenerate button and writes generated text", async () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		const generate = vi.fn().mockResolvedValue("Studio backdrop with soft light")

		kit.mount(ctx, root, {
			initialState: {
				backgroundPrompt: "",
				productImages: [{ id: "product-1" }],
			},
			sections: [
				{
					id: "backgroundPrompt",
					kind: "textarea",
					stateKey: "backgroundPrompt",
					title: "Background prompt",
					maxLength: 2000,
					deps: ["productImages"],
					aiGenerate: {
						label: "AI generate",
						loadingLabel: "Generating…",
						disabled: ({ state }: { state: Record<string, unknown> }) =>
							!Array.isArray(state.productImages) || state.productImages.length === 0,
						generate,
					},
				},
			],
			generate: createGenerateConfig(),
		})

		const aiButton = root.querySelector<HTMLButtonElement>(".mpk-textarea-ai-button")
		const textarea = root.querySelector<HTMLTextAreaElement>(".mpk-textarea-ai-field")

		expect(aiButton).not.toBeNull()
		expect(aiButton?.disabled).toBe(false)
		expect(root.querySelector(".mpk-textarea-ai-wrap")).not.toBeNull()

		aiButton!.click()
		expect(aiButton?.disabled).toBe(true)
		expect(aiButton?.textContent).toBe("Generating…")

		await vi.waitFor(() => {
			expect(generate).toHaveBeenCalledTimes(1)
			expect(textarea?.value).toBe("Studio backdrop with soft light")
		})

		expect(aiButton?.disabled).toBe(false)
		expect(aiButton?.textContent).toContain("AI generate")
		expect(root.textContent).toContain("31 / 2000")
	})

	it("disables textarea aiGenerate button when disabled callback is true", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {
				backgroundPrompt: "",
				productImages: [],
			},
			sections: [
				{
					id: "backgroundPrompt",
					kind: "textarea",
					stateKey: "backgroundPrompt",
					title: "Background prompt",
					deps: ["productImages"],
					aiGenerate: {
						label: "AI generate",
						disabled: ({ state }: { state: Record<string, unknown> }) =>
							!Array.isArray(state.productImages) || state.productImages.length === 0,
						generate: vi.fn(),
					},
				},
			],
			generate: createGenerateConfig(),
		})

		expect(root.querySelector<HTMLButtonElement>(".mpk-textarea-ai-button")?.disabled).toBe(
			true,
		)
	})

	it("toggles boolean state with help text", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {
				samePatternReplace: false,
			},
			sections: [
				{
					id: "samePatternReplace",
					kind: "toggle",
					stateKey: "samePatternReplace",
					title: "Same-pattern replace",
					help: "Works better when both garments share the same silhouette.",
				},
			],
			generate: createGenerateConfig(),
		})

		const toggle = root.querySelector<HTMLInputElement>(".mpk-toggle")
		expect(toggle).not.toBeNull()
		expect(toggle?.checked).toBe(false)
		expect(root.textContent).toContain(
			"Works better when both garments share the same silhouette.",
		)

		toggle?.click()

		const nextToggle = root.querySelector<HTMLInputElement>(".mpk-toggle")
		expect(nextToggle?.checked).toBe(true)
	})

	it("switches size-control ratio options from model sizes", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		const model = createModel()

		kit.mount(ctx, root, {
			initialState: {
				modelOptions: [model],
				modelId: model.model_id,
				canvasRatioKey: "1:1",
			},
			modelConfig: {
				autoLoad: false,
			},
			sections: [
				{
					id: "canvasSize",
					kind: "size-control",
					title: "Canvas size",
					ratioStateKey: "canvasRatioKey",
				},
			],
			generate: createGenerateConfig(),
		})

		const ratioButtons = root.querySelectorAll<HTMLButtonElement>(
			".mpk-size-control-ratios .mpk-option",
		)
		expect(ratioButtons[0].classList.contains("is-active")).toBe(true)
		expect(root.querySelectorAll(".mpk-size-input")).toHaveLength(0)

		ratioButtons[1].click()

		const nextButtons = root.querySelectorAll<HTMLButtonElement>(
			".mpk-size-control-ratios .mpk-option",
		)
		expect(nextButtons[0].classList.contains("is-active")).toBe(false)
		expect(nextButtons[1].classList.contains("is-active")).toBe(true)
	})

	it("builds genCount options from model max_output_images and clamps invalid values", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		const modelA = createModel()
		const modelB = {
			...createModel(),
			model_id: "model-b",
			model_name: "Model B",
			image_size_config: {
				...createModel().image_size_config,
				max_output_images: 2,
			},
		}

		kit.mount(ctx, root, {
			initialState: {
				modelOptions: [modelA, modelB],
				modelId: modelA.model_id,
				genCount: 4,
			},
			modelConfig: {
				autoLoad: false,
			},
			sections: [
				{
					id: "modelSelect",
					kind: "model-select",
					title: "Model",
				},
				{
					id: "count",
					kind: "option-group",
					stateKey: "genCount",
					title: "Count",
				},
			],
			generate: createGenerateConfig(),
		})

		expect(root.querySelectorAll(".mpk-option-group .mpk-option")).toHaveLength(4)
		const countButtons = root.querySelectorAll<HTMLButtonElement>(
			".mpk-content > .mpk-slot:nth-child(2) .mpk-option",
		)
		expect(Array.from(countButtons).map((button) => button.textContent)).toEqual([
			"1",
			"2",
			"3",
			"4",
		])
		expect(countButtons[3]?.classList.contains("is-active")).toBe(true)

		const modelOption = root.querySelector<HTMLButtonElement>(
			'.mpk-model-select-option[data-model-id="model-b"]',
		)
		modelOption?.click()

		const nextCountButtons = root.querySelectorAll<HTMLButtonElement>(
			".mpk-content > .mpk-slot:nth-child(2) .mpk-option",
		)
		expect(Array.from(nextCountButtons).map((button) => button.textContent)).toEqual(["1", "2"])
		expect(nextCountButtons[1]?.classList.contains("is-active")).toBe(true)
	})

	it("prefers generate.execute over buildRequest and allows multiple generate calls", async () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		const buildRequest = vi.fn(() => ({ prompt: "single-request" }))
		const execute = vi.fn(async ({ generateAndPlace }) => {
			await generateAndPlace({ prompt: "first-request" })
			return generateAndPlace({ prompt: "second-request" })
		})
		ctx.ai = {
			generateAndPlace: vi
				.fn()
				.mockResolvedValueOnce({ elementIds: ["first"] })
				.mockResolvedValueOnce({ elementIds: ["second"] }),
		}

		kit.mount(ctx, root, {
			initialState: {},
			sections: [],
			generate: {
				...createGenerateConfig(),
				buildRequest,
				execute,
			},
		})

		root.querySelector<HTMLButtonElement>(".mpk-generate")?.click()

		await vi.waitFor(() => {
			expect(execute).toHaveBeenCalledTimes(1)
		})
		expect(buildRequest).not.toHaveBeenCalled()
		const generateAndPlace = (ctx as any).ai.generateAndPlace as ReturnType<typeof vi.fn>
		expect(generateAndPlace).toHaveBeenCalledTimes(2)
		expect(generateAndPlace).toHaveBeenNthCalledWith(1, { prompt: "first-request" })
		expect(generateAndPlace).toHaveBeenNthCalledWith(2, { prompt: "second-request" })
	})

	it("commits a dirty mask before generate and does not re-upload an unchanged mask", async () => {
		const cleanup = installMaskPainterDomMocks()
		try {
			const kit = loadMagicPluginKit()
			const root = createRoot()
			const ctx = createCtx() as any
			const cropAsset = { uploadId: "crop-1", url: "crop-url" }
			const buildRequest = vi.fn(({ state }) => ({ cropImage: state.cropImage }))
			ctx.assets.fetchBlob = vi
				.fn()
				.mockResolvedValue(new Blob(["source"], { type: "image/png" }))
			ctx.assets.uploadFile = vi.fn().mockResolvedValue(cropAsset)
			ctx.ai = {
				generateAndPlace: vi.fn().mockResolvedValue({ elementIds: ["result"] }),
			}

			kit.mount(ctx, root, {
				initialState: {
					sourceImage: {
						uploadId: "source-1",
						url: "source-url",
						name: "source photo.jpg",
					},
				},
				sections: [
					{
						id: "maskPainter",
						kind: "mask-painter",
						stateKey: "cropImage",
						sourceStateKey: "sourceImage",
						title: "Mask",
						deps: ["sourceImage"],
					},
				],
				generate: {
					...createGenerateConfig(),
					buildRequest,
				},
			})

			const canvas = root.querySelector<HTMLCanvasElement>(".mpk-mask-canvas")
			expect(canvas).toBeTruthy()
			setCanvasClientRect(canvas as HTMLCanvasElement)

			await vi.waitFor(() => {
				expect(canvas?.width).toBe(100)
			})

			canvas?.dispatchEvent(
				new MouseEvent("mousedown", {
					clientX: 20,
					clientY: 20,
				}),
			)
			canvas?.dispatchEvent(new MouseEvent("mouseup"))

			const preview = root.querySelector<HTMLDivElement>(".mpk-mask-preview")
			expect(preview).toBeTruthy()
			await vi.waitFor(() => {
				expect(preview?.classList.contains("is-visible")).toBe(true)
			})
			expect(preview?.querySelector("img")?.getAttribute("src")).toBe(
				"data:image/png;base64,mask-preview",
			)

			root.querySelector<HTMLButtonElement>(".mpk-generate")?.click()

			await vi.waitFor(() => {
				expect(buildRequest).toHaveBeenCalledTimes(1)
			})
			expect(ctx.assets.uploadFile).toHaveBeenCalledTimes(1)
			expect(buildRequest.mock.calls[0][0].state.cropImage).toBe(cropAsset)
			expect(ctx.ai.generateAndPlace).toHaveBeenLastCalledWith({ cropImage: cropAsset })

			root.querySelector<HTMLButtonElement>(".mpk-generate")?.click()

			await vi.waitFor(() => {
				expect(buildRequest).toHaveBeenCalledTimes(2)
			})
			expect(ctx.assets.uploadFile).toHaveBeenCalledTimes(1)
			expect(buildRequest.mock.calls[1][0].state.cropImage).toBe(cropAsset)
		} finally {
			cleanup()
		}
	})

	it("exposes pending mask state to generate callbacks before the mask is confirmed", async () => {
		const cleanup = installMaskPainterDomMocks()
		try {
			const kit = loadMagicPluginKit()
			const root = createRoot()
			const ctx = createCtx() as any
			const cropAsset = { uploadId: "crop-1", url: "crop-url" }
			const buildRequest = vi.fn(({ state }) => ({ cropImage: state.cropImage }))
			const hasTarget = ({ state, helpers }: any) =>
				Boolean(state.cropImage) || helpers.hasPendingMask("maskPainter")

			ctx.assets.fetchBlob = vi
				.fn()
				.mockResolvedValue(new Blob(["source"], { type: "image/png" }))
			ctx.assets.uploadFile = vi.fn().mockResolvedValue(cropAsset)
			ctx.ai = {
				generateAndPlace: vi.fn().mockResolvedValue({ elementIds: ["result"] }),
			}

			kit.mount(ctx, root, {
				initialState: {
					sourceImage: {
						uploadId: "source-1",
						url: "source-url",
						name: "source photo.jpg",
					},
				},
				sections: [
					{
						id: "maskPainter",
						kind: "mask-painter",
						stateKey: "cropImage",
						sourceStateKey: "sourceImage",
						title: "Mask",
						deps: ["sourceImage"],
					},
				],
				generate: {
					...createGenerateConfig(),
					getIdleHint: (context: any) => (hasTarget(context) ? "" : "Missing target"),
					isDisabled: (context: any) => !hasTarget(context),
					buildRequest,
				},
			})

			let generateButton = root.querySelector<HTMLButtonElement>(".mpk-generate")
			expect(generateButton?.disabled).toBe(true)
			expect(root.querySelector(".mpk-empty")?.textContent).toBe("Missing target")

			const canvas = root.querySelector<HTMLCanvasElement>(".mpk-mask-canvas")
			expect(canvas).toBeTruthy()
			setCanvasClientRect(canvas as HTMLCanvasElement)

			await vi.waitFor(() => {
				expect(canvas?.width).toBe(100)
			})

			canvas?.dispatchEvent(
				new MouseEvent("mousedown", {
					clientX: 20,
					clientY: 20,
				}),
			)
			canvas?.dispatchEvent(new MouseEvent("mouseup"))

			await vi.waitFor(() => {
				generateButton = root.querySelector<HTMLButtonElement>(".mpk-generate")
				expect(generateButton?.disabled).toBe(false)
			})
			expect(root.querySelector(".mpk-empty")).toBeNull()

			generateButton?.click()

			await vi.waitFor(() => {
				expect(buildRequest).toHaveBeenCalledTimes(1)
			})
			expect(ctx.assets.uploadFile).toHaveBeenCalledTimes(1)
			expect(buildRequest.mock.calls[0][0].state.cropImage).toBe(cropAsset)
		} finally {
			cleanup()
		}
	})

	it("applies the painted shape as alpha when mask crop mode is masked", async () => {
		const cleanup = installMaskPainterDomMocks()
		try {
			const kit = loadMagicPluginKit()
			const root = createRoot()
			const ctx = createCtx() as any
			const cropAsset = { uploadId: "crop-1", url: "crop-url" }
			const buildRequest = vi.fn(({ state }) => ({ cropImage: state.cropImage }))
			ctx.assets.fetchBlob = vi
				.fn()
				.mockResolvedValue(new Blob(["source"], { type: "image/png" }))
			ctx.assets.uploadFile = vi.fn().mockResolvedValue(cropAsset)
			ctx.ai = {
				generateAndPlace: vi.fn().mockResolvedValue({ elementIds: ["result"] }),
			}

			kit.mount(ctx, root, {
				initialState: {
					sourceImage: {
						uploadId: "source-1",
						url: "source-url",
						name: "source photo.jpg",
					},
				},
				sections: [
					{
						id: "maskPainter",
						kind: "mask-painter",
						stateKey: "cropImage",
						sourceStateKey: "sourceImage",
						title: "Mask",
						maskCropMode: "masked",
						cropPadding: 1,
						deps: ["sourceImage"],
					},
				],
				generate: {
					...createGenerateConfig(),
					buildRequest,
				},
			})

			const canvas = root.querySelector<HTMLCanvasElement>(".mpk-mask-canvas")
			expect(canvas).toBeTruthy()
			setCanvasClientRect(canvas as HTMLCanvasElement)

			await vi.waitFor(() => {
				expect(canvas?.width).toBe(100)
			})

			canvas?.dispatchEvent(
				new MouseEvent("mousedown", {
					clientX: 20,
					clientY: 20,
				}),
			)
			canvas?.dispatchEvent(new MouseEvent("mouseup"))
			root.querySelector<HTMLButtonElement>(".mpk-generate")?.click()

			await vi.waitFor(() => {
				expect(buildRequest).toHaveBeenCalledTimes(1)
			})

			const alphaContext = cleanup.contexts.find(
				(context) => context.putImageData.mock.calls.length > 0,
			)
			expect(alphaContext).toBeTruthy()
			const alphaData = alphaContext.putImageData.mock.calls[0][0].data
			expect(alphaData[3]).toBe(255)
			expect(alphaData[7]).toBe(0)
			expect(
				cleanup.contexts.some(
					(context) => context.globalCompositeOperation === "destination-in",
				),
			).toBe(true)
			expect(ctx.assets.uploadFile).toHaveBeenCalledWith(
				expect.any(Blob),
				expect.stringMatching(/^source-photo-crop-\d+-\d+\.png$/),
				"image/png",
			)

			const preview = root.querySelector<HTMLDivElement>(".mpk-mask-preview")
			root.querySelector<HTMLButtonElement>(".mpk-mask-clear-btn")?.click()
			expect(preview?.classList.contains("is-visible")).toBe(false)
			expect(preview?.querySelector("img")?.hasAttribute("src")).toBe(false)
		} finally {
			cleanup()
		}
	})

	it("uses unique upload names for multiple pending mask painters", async () => {
		const cleanup = installMaskPainterDomMocks()
		try {
			const kit = loadMagicPluginKit()
			const root = createRoot()
			const ctx = createCtx() as any
			const buildRequest = vi.fn(({ state }) => ({
				cropImage: state.cropImage,
				refCropImage: state.refCropImage,
			}))
			ctx.assets.fetchBlob = vi
				.fn()
				.mockResolvedValue(new Blob(["source"], { type: "image/png" }))
			ctx.assets.uploadFile = vi.fn(async (_blob: Blob, fileName: string) => ({
				uploadId: fileName,
				url: `uploaded:${fileName}`,
			}))
			ctx.ai = {
				generateAndPlace: vi.fn().mockResolvedValue({ elementIds: ["result"] }),
			}

			kit.mount(ctx, root, {
				initialState: {
					sourceImage: {
						uploadId: "source-1",
						url: "source-url",
						name: "source photo.jpg",
					},
					referenceProductImage: {
						uploadId: "reference-1",
						url: "reference-url",
						name: "reference product.png",
					},
				},
				sections: [
					{
						id: "maskPainter",
						kind: "mask-painter",
						stateKey: "cropImage",
						sourceStateKey: "sourceImage",
						title: "Source Mask",
						deps: ["sourceImage"],
					},
					{
						id: "refMaskPainter",
						kind: "mask-painter",
						stateKey: "refCropImage",
						sourceStateKey: "referenceProductImage",
						title: "Reference Mask",
						deps: ["referenceProductImage"],
					},
				],
				generate: {
					...createGenerateConfig(),
					buildRequest,
				},
			})

			const canvases = root.querySelectorAll<HTMLCanvasElement>(".mpk-mask-canvas")
			expect(canvases).toHaveLength(2)
			canvases.forEach((canvas) => setCanvasClientRect(canvas))

			await vi.waitFor(() => {
				expect(canvases[0]?.width).toBe(100)
				expect(canvases[1]?.width).toBe(100)
			})

			canvases[0]?.dispatchEvent(
				new MouseEvent("mousedown", {
					clientX: 20,
					clientY: 20,
				}),
			)
			canvases[0]?.dispatchEvent(new MouseEvent("mouseup"))
			canvases[1]?.dispatchEvent(
				new MouseEvent("mousedown", {
					clientX: 40,
					clientY: 40,
				}),
			)
			canvases[1]?.dispatchEvent(new MouseEvent("mouseup"))
			root.querySelector<HTMLButtonElement>(".mpk-generate")?.click()

			await vi.waitFor(() => {
				expect(buildRequest).toHaveBeenCalledTimes(1)
			})

			const uploadedNames = ctx.assets.uploadFile.mock.calls.map((call: unknown[]) => call[1])
			expect(uploadedNames).toHaveLength(2)
			expect(new Set(uploadedNames).size).toBe(2)
			expect(uploadedNames).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/^source-photo-crop-\d+-\d+\.png$/),
					expect.stringMatching(/^reference-product-crop-\d+-\d+\.png$/),
				]),
			)
			const requestState = buildRequest.mock.calls[0][0].state
			expect(requestState.cropImage).not.toEqual(requestState.refCropImage)
			expect(requestState.cropImage.uploadId).toMatch(/^source-photo-crop-/)
			expect(requestState.refCropImage.uploadId).toMatch(/^reference-product-crop-/)
		} finally {
			cleanup()
		}
	})

	it("keeps mask painter brush size stable in screen pixels", async () => {
		const cleanup = installMaskPainterDomMocks()
		try {
			const kit = loadMagicPluginKit()
			const root = createRoot()
			const ctx = createCtx()

			kit.mount(ctx, root, {
				initialState: {
					sourceImage: { uploadId: "source-1", url: "source-url" },
				},
				sections: [
					{
						id: "maskPainter",
						kind: "mask-painter",
						stateKey: "cropImage",
						sourceStateKey: "sourceImage",
						title: "Mask",
						brushSize: 40,
						deps: ["sourceImage"],
					},
				],
				generate: createGenerateConfig(),
			})

			const canvas = root.querySelector<HTMLCanvasElement>(".mpk-mask-canvas")
			expect(canvas).toBeTruthy()
			setCanvasClientRect(canvas as HTMLCanvasElement, 50, 50)

			await vi.waitFor(() => {
				expect(canvas?.width).toBe(100)
			})

			const modeButtons = root.querySelectorAll<HTMLButtonElement>(".mpk-mask-mode-btn")
			expect(modeButtons).toHaveLength(2)
			expect(modeButtons[0]?.textContent).toBe("涂抹")
			expect(modeButtons[0]?.classList.contains("is-active")).toBe(true)
			expect(modeButtons[1]?.textContent).toBe("擦除")
			expect(modeButtons[1]?.classList.contains("is-active")).toBe(false)

			const displayContext = canvas?.getContext("2d") as any
			displayContext.arc.mockClear()
			cleanup.contexts.forEach((context) => {
				context.getImageData.mockClear()
			})
			canvas?.dispatchEvent(
				new MouseEvent("mousedown", {
					clientX: 10,
					clientY: 10,
				}),
			)
			canvas?.dispatchEvent(
				new MouseEvent("mousemove", {
					clientX: 20,
					clientY: 20,
				}),
			)

			expect(displayContext.arc.mock.calls.some((call: unknown[]) => call[2] === 40)).toBe(
				true,
			)
			expect(
				cleanup.contexts.every((context) => context.getImageData.mock.calls.length === 0),
			).toBe(true)

			modeButtons[1]?.click()
			expect(modeButtons[0]?.classList.contains("is-active")).toBe(false)
			expect(modeButtons[1]?.classList.contains("is-active")).toBe(true)

			const brushSlider = root.querySelector<HTMLInputElement>(".mpk-mask-brush-slider")
			expect(brushSlider).toBeTruthy()
			if (brushSlider) {
				brushSlider.value = "60"
				brushSlider.dispatchEvent(new Event("input"))
			}
			displayContext.arc.mockClear()
			canvas?.dispatchEvent(
				new MouseEvent("mousemove", {
					clientX: 25,
					clientY: 25,
				}),
			)
			expect(displayContext.arc.mock.calls.some((call: unknown[]) => call[2] === 60)).toBe(
				true,
			)
		} finally {
			cleanup()
		}
	})

	it("shows a start toast after validation passes and before generation runs", async () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		const buildRequest = vi.fn(() => ({ prompt: "request" }))
		ctx.ai = {
			generateAndPlace: vi.fn().mockResolvedValue({ elementIds: ["result"] }),
		}

		kit.mount(ctx, root, {
			initialState: {},
			sections: [],
			generate: {
				...createGenerateConfig(),
				startMessage: "Custom start",
				buildRequest,
			},
		})

		root.querySelector<HTMLButtonElement>(".mpk-generate")?.click()

		await vi.waitFor(() => {
			expect(buildRequest).toHaveBeenCalledTimes(1)
		})
		expect(ctx.ui.toast).toHaveBeenCalledWith("Custom start", "info")
		expect(ctx.ui.toast).toHaveBeenCalledTimes(1)
	})

	it("uses an English default start toast outside Chinese locales", async () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx() as ReturnType<typeof createCtx> & {
			i18n: ReturnType<typeof createCtx>["i18n"] & { locale?: string }
		}
		const buildRequest = vi.fn(() => ({ prompt: "request" }))
		ctx.i18n.locale = "en-US"
		ctx.ai = {
			generateAndPlace: vi.fn().mockResolvedValue({ elementIds: ["result"] }),
		}

		kit.mount(ctx, root, {
			initialState: {},
			sections: [],
			generate: {
				...createGenerateConfig(),
				buildRequest,
			},
		})

		root.querySelector<HTMLButtonElement>(".mpk-generate")?.click()

		await vi.waitFor(() => {
			expect(buildRequest).toHaveBeenCalledTimes(1)
		})
		expect(ctx.ui.toast).toHaveBeenCalledWith("Generation started", "info")
	})

	it("does not show a start toast when validation fails", async () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {},
			sections: [],
			generate: {
				...createGenerateConfig(),
				validate: () => "Missing input",
			},
		})

		root.querySelector<HTMLButtonElement>(".mpk-generate")?.click()

		await vi.waitFor(() => {
			expect(root.querySelector(".mpk-error")?.textContent).toBe("Missing input")
		})
		expect(ctx.ui.toast).not.toHaveBeenCalled()
	})

	it("renders a required marker for standard sections", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {
				prompt: "",
			},
			sections: [
				{
					id: "prompt",
					kind: "textarea",
					stateKey: "prompt",
					title: "Prompt",
					required: true,
				},
			],
			generate: createGenerateConfig(),
		})

		const requiredMarker = root.querySelector(".mpk-section-required")
		expect(requiredMarker?.textContent).toBe("必填")
		expect(root.querySelector(".mpk-section-title")?.textContent).toContain("Prompt")
	})

	it("renders a required marker for image-grid sections", () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {
				productImages: [],
			},
			sections: [
				{
					id: "productImages",
					kind: "image-grid",
					stateKey: "productImages",
					title: "Products",
					required: true,
				},
			],
			generate: createGenerateConfig(),
		})

		expect(root.querySelector(".mpk-section-required")?.textContent).toBe("必填")
	})
})
