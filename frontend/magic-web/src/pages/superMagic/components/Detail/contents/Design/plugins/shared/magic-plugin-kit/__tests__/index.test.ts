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

		const secondCardRemoveButton = cards[1].querySelector<HTMLButtonElement>(".mpk-remove-button")
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
					options: [{ value: "fast", label: "Fast", description: "Default hidden description" }],
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

		const toggle = root.querySelector<HTMLButtonElement>(".mpk-toggle")
		expect(toggle).not.toBeNull()
		expect(toggle?.getAttribute("aria-pressed")).toBe("false")
		expect(root.textContent).toContain(
			"Works better when both garments share the same silhouette.",
		)

		toggle?.click()

		const nextToggle = root.querySelector<HTMLButtonElement>(".mpk-toggle")
		expect(nextToggle?.getAttribute("aria-pressed")).toBe("true")
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

		const ratioButtons = root.querySelectorAll<HTMLButtonElement>(".mpk-size-control-ratios .mpk-option")
		expect(ratioButtons[0].classList.contains("is-active")).toBe(true)
		expect(root.querySelectorAll(".mpk-size-input")).toHaveLength(0)

		ratioButtons[1].click()

		const nextButtons = root.querySelectorAll<HTMLButtonElement>(".mpk-size-control-ratios .mpk-option")
		expect(nextButtons[0].classList.contains("is-active")).toBe(false)
		expect(nextButtons[1].classList.contains("is-active")).toBe(true)
	})
})
