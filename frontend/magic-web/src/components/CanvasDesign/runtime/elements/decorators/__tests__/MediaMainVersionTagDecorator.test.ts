import Konva from "konva"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MediaMainVersionTagDecorator } from "../MediaMainVersionTagDecorator"

function createEventEmitterMock() {
	const handlers = new Map<string, Array<() => void>>()

	return {
		handlers,
		eventEmitter: {
			on: vi.fn((eventType: string, handler: () => void) => {
				const currentHandlers = handlers.get(eventType) ?? []
				currentHandlers.push(handler)
				handlers.set(eventType, currentHandlers)
				return () => {
					handlers.set(
						eventType,
						(handlers.get(eventType) ?? []).filter((current) => current !== handler),
					)
				}
			}),
			off: vi.fn((eventType: string, handler: () => void) => {
				handlers.set(
					eventType,
					(handlers.get(eventType) ?? []).filter((current) => current !== handler),
				)
			}),
		},
	}
}

function createHarness() {
	const container = document.createElement("div")
	document.body.appendChild(container)
	const stage = new Konva.Stage({ container, width: 600, height: 400 })
	stage.scale({ x: 2, y: 2 })
	const layer = new Konva.Layer()
	stage.add(layer)
	const group = new Konva.Group({ width: 240, height: 160, scaleX: 0.5, scaleY: 0.5 })
	layer.add(group)
	const { eventEmitter, handlers } = createEventEmitterMock()
	const canvas = {
		readonly: false,
		eventEmitter,
		t: vi.fn((_key: string, options: { defaultValue: string }) => options.defaultValue),
	}

	return { canvas, group, handlers, stage }
}

function versionedMedia(type: "image" | "video", activeContentId = "main") {
	return {
		id: `${type}-1`,
		type,
		width: 240,
		height: 160,
		activeContentId,
		mainContentId: "main",
		contents: [
			{ contentId: "main", src: `/${type}-main`, status: "completed" },
			{ contentId: "other", src: `/${type}-other`, status: "completed" },
		],
	} as never
}

describe("MediaMainVersionTagDecorator", () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
			scale: vi.fn(),
		} as unknown as CanvasRenderingContext2D)
	})

	afterEach(() => {
		vi.restoreAllMocks()
		document.body.innerHTML = ""
	})

	it.each(["image", "video"] as const)(
		"shows the static main-version tag for a main %s Content",
		(type) => {
			const { canvas, group, stage } = createHarness()
			const decorator = new MediaMainVersionTagDecorator(group, {
				canvas: canvas as never,
				width: 240,
				height: 160,
				data: versionedMedia(type),
			})

			decorator.create()
			const tag = group.findOne<Konva.Group>(".decorator-media-main-version-tag")

			expect(tag).toBeTruthy()
			expect(tag?.listening()).toBe(false)
			expect(tag?.height()).toBe(24)
			expect(tag?.findOne<Konva.Text>("Text")?.text()).toBe("主版本")

			decorator.destroy()
			stage.destroy()
		},
	)

	it("hides the tag when the active Content is not the main Content", () => {
		const { canvas, group, stage } = createHarness()
		const decorator = new MediaMainVersionTagDecorator(group, {
			canvas: canvas as never,
			width: 240,
			height: 160,
			data: versionedMedia("image"),
		})

		decorator.create()
		expect(group.findOne(".decorator-media-main-version-tag")).toBeTruthy()

		decorator.updateConfig({ data: versionedMedia("image", "other") })
		expect(group.findOne(".decorator-media-main-version-tag")).toBeUndefined()

		decorator.destroy()
		stage.destroy()
	})

	it("keeps the tag at a fixed screen size and hides it below the content threshold", () => {
		const { canvas, group, handlers, stage } = createHarness()
		const decorator = new MediaMainVersionTagDecorator(group, {
			canvas: canvas as never,
			width: 240,
			height: 160,
			data: versionedMedia("image"),
		})

		decorator.create()
		const tag = group.findOne<Konva.Group>(".decorator-media-main-version-tag")
		expect(tag?.visible()).toBe(true)

		stage.scale({ x: 1.5, y: 1.5 })
		handlers.get("viewport:scale")?.[0]?.()
		expect(tag?.visible()).toBe(false)

		stage.scale({ x: 2, y: 2 })
		handlers.get("viewport:scale")?.[0]?.()
		expect(tag?.visible()).toBe(true)
		expect(
			(tag?.height() ?? 0) * (tag?.scaleY() ?? 0) * stage.scaleX() * group.scaleY(),
		).toBeCloseTo(24)
		expect((tag?.x() ?? 0) * stage.scaleX() * group.scaleX()).toBeCloseTo(8)

		decorator.destroy()
		stage.destroy()
	})
})
