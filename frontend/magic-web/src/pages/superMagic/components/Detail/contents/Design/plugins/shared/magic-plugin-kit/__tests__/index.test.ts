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
			sizes: [
				{ label: "1:1", value: "1024x1024", scale: "1K" },
				{ label: "1:1", value: "2048x2048", scale: "2K" },
				{ label: "3:4", value: "1152x1536", scale: "1K" },
				{ label: "3:4", value: "2304x3072", scale: "2K" },
			],
		},
	}
}

describe("magic-plugin-kit", () => {
	beforeEach(() => {
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
		expect(promptSlot.querySelector(".mpk-textarea-count")?.textContent).toBe("5/5")

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
		expect(requiredMarker?.textContent).toBe("*")
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

		expect(root.querySelector(".mpk-section-required")?.textContent).toBe("*")
	})

	it("blocks generate on the first missing required section before plugin validate runs", async () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		const validate = vi.fn(() => null)
		const buildRequest = vi.fn(() => ({}))
		ctx.ai = {
			generateAndPlace: vi.fn(),
		}

		kit.mount(ctx, root, {
			initialState: {
				productImage: null,
			},
			sections: [
				{
					id: "productImage",
					kind: "image-slot",
					stateKey: "productImage",
					title: "Product image",
					required: {
						message: "Please upload a product image",
					},
				},
			],
			generate: {
				...createGenerateConfig(),
				validate,
				buildRequest,
			},
		})

		root.querySelector<HTMLButtonElement>(".mpk-generate")?.click()

		await vi.waitFor(() => {
			expect(root.querySelector(".mpk-error")?.textContent).toBe("Please upload a product image")
		})
		expect(validate).not.toHaveBeenCalled()
		expect(buildRequest).not.toHaveBeenCalled()
		expect((ctx as any).ai.generateAndPlace).not.toHaveBeenCalled()
	})

	it("skips required marker and validation when required.when returns false", async () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()
		const validate = vi.fn(() => "plugin validation")

		kit.mount(ctx, root, {
			initialState: {
				productImage: null,
			},
			sections: [
				{
					id: "productImage",
					kind: "image-slot",
					stateKey: "productImage",
					title: "Product image",
					required: {
						message: "Please upload a product image",
						when: () => false,
					},
				},
			],
			generate: {
				...createGenerateConfig(),
				validate,
			},
		})

		expect(root.querySelector(".mpk-section-required")).toBeNull()

		root.querySelector<HTMLButtonElement>(".mpk-generate")?.click()

		await vi.waitFor(() => {
			expect(validate).toHaveBeenCalledTimes(1)
		})
		expect(root.querySelector(".mpk-error")?.textContent).toBe("plugin validation")
	})

	it("uses custom required validators for specialized emptiness rules", async () => {
		const kit = loadMagicPluginKit()
		const root = createRoot()
		const ctx = createCtx()

		kit.mount(ctx, root, {
			initialState: {
				confirmSelection: false,
			},
			sections: [
				{
					id: "confirmSelection",
					kind: "toggle",
					stateKey: "confirmSelection",
					title: "Confirm selection",
					required: {
						message: "Please confirm the selection",
						validate: ({ value }: { value: boolean }) => value === true,
					},
				},
			],
			generate: createGenerateConfig(),
		})

		root.querySelector<HTMLButtonElement>(".mpk-generate")?.click()

		await vi.waitFor(() => {
			expect(root.querySelector(".mpk-error")?.textContent).toBe("Please confirm the selection")
		})
	})
})
