import Konva from "konva"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { ElementTypeEnum } from "../../../document/types"
import { exportCanvasDocument } from "../../../document/exportDocument"
import { TransformBehavior } from "../../../interaction/transform/TransformManager"
import { AudioElement } from "../AudioElement"

describe("AudioElement", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("creates a persistent DSL element without runtime playback or upload fields", () => {
		const element = AudioElement.createElementData({
			id: "audio-1",
			x: 10,
			y: 20,
			src: "./audios/voice.mp3",
		})

		expect(element).toMatchObject({
			id: "audio-1",
			type: ElementTypeEnum.Audio,
			x: 10,
			y: 20,
			width: 1280,
			height: 720,
			src: "./audios/voice.mp3",
		})
		expect(element).not.toHaveProperty("status")
		expect(element).not.toHaveProperty("errorMessage")
		expect(element).not.toHaveProperty("duration")
		expect(element).not.toHaveProperty("currentTime")
		expect(element).not.toHaveProperty("paused")
	})

	it("declares horizontal-only resize constraints", () => {
		const element = Object.create(AudioElement.prototype) as AudioElement

		expect(element.getTransformBehavior()).toBe(TransformBehavior.APPLY_TO_SIZE)
		expect(element.getTransformConstraints()).toEqual({
			enabledAnchors: ["middle-left", "middle-right"],
			minWidth: 240,
			fixedHeight: 720,
		})
	})

	it("normalizes legacy audio dimensions without overwriting a custom width", () => {
		const canvas = {
			audioPlaybackManager: {
				getSnapshot: vi.fn(() => ({
					duration: 0,
					currentTime: 0,
					paused: true,
					ended: false,
					loading: false,
					error: false,
				})),
				subscribe: vi.fn(() => vi.fn()),
			},
			eventEmitter: { on: vi.fn(() => vi.fn()) },
		} as unknown as Canvas
		const legacyDefault = new AudioElement(
			{
				id: "audio-default",
				type: ElementTypeEnum.Audio,
				x: 0,
				y: 0,
				width: 480,
				height: 120,
			},
			canvas,
		)
		const legacyCustomWidth = new AudioElement(
			{
				id: "audio-custom",
				type: ElementTypeEnum.Audio,
				x: 0,
				y: 0,
				width: 640,
				height: 120,
			},
			canvas,
		)

		expect(legacyDefault.getData()).toMatchObject({ width: 1280, height: 720 })
		expect(legacyCustomWidth.getData()).toMatchObject({ width: 640, height: 720 })
	})

	it("renders a sharp-cornered card without a fullscreen button", () => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
		} as unknown as CanvasRenderingContext2D)
		const canvas = {
			audioPlaybackManager: {
				getSnapshot: vi.fn(() => ({
					duration: 0,
					currentTime: 0,
					paused: true,
					ended: false,
					loading: false,
					error: false,
				})),
				subscribe: vi.fn(() => vi.fn()),
				seek: vi.fn(),
			},
			audioResourceManager: { getFailureReason: vi.fn(() => null) },
			eventEmitter: { on: vi.fn(() => vi.fn()) },
			elementManager: {
				canDragElement: vi.fn(() => true),
				canListenElement: vi.fn(() => true),
			},
			runtimeScheduler: { requestLayerDraw: vi.fn() },
		} as unknown as Canvas
		const element = new AudioElement(
			AudioElement.createElementData({ id: "audio-1", x: 0, y: 0 }),
			canvas,
		)

		const group = element.render()
		const hitArea = group.findOne(".hit-area") as Konva.Rect
		const background = group.getChildren(
			(node) => node instanceof Konva.Rect && node.name() !== "hit-area",
		)[0] as Konva.Rect
		const hasFullscreenGlyph = group
			.find("Text")
			.some((node) => (node as Konva.Text).text() === "⛶")

		expect(group.size()).toEqual({ width: 1280, height: 720 })
		expect(hitArea.cornerRadius()).toBe(0)
		expect(background.cornerRadius()).toBe(0)
		expect(hasFullscreenGlyph).toBe(false)
	})

	it("exports only base fields and src from the formal audio DSL", () => {
		const [exported] = exportCanvasDocument([
			{
				id: "audio-1",
				type: ElementTypeEnum.Audio,
				x: 10,
				y: 20,
				width: 480,
				height: 120,
				src: "./audios/voice.mp3",
				status: "failed",
				errorMessage: "runtime-only",
				duration: 12,
				paused: false,
			} as never,
		]).elements

		expect(exported).toMatchObject({
			id: "audio-1",
			type: ElementTypeEnum.Audio,
			src: "./audios/voice.mp3",
		})
		expect(exported).not.toHaveProperty("status")
		expect(exported).not.toHaveProperty("errorMessage")
		expect(exported).not.toHaveProperty("duration")
		expect(exported).not.toHaveProperty("paused")
	})

	it("does not create an audio node until visibility admits the mounted element", () => {
		const unregisterPlayback = vi.fn()
		const unregisterFailure = vi.fn()
		const registerAudioElement = vi.fn()
		const unregisterAudioElement = vi.fn()
		const createElement = vi.spyOn(document, "createElement")
		const canvas = {
			audioPlaybackManager: {
				getSnapshot: vi.fn(() => ({
					duration: 0,
					currentTime: 0,
					paused: true,
					ended: false,
					loading: false,
					error: false,
				})),
				subscribe: vi.fn(() => unregisterPlayback),
			},
			eventEmitter: {
				on: vi.fn(() => unregisterFailure),
			},
			visibilityManager: {
				registerAudioElement,
				unregisterAudioElement,
			},
		} as unknown as Canvas
		const element = new AudioElement(
			AudioElement.createElementData({
				id: "audio-1",
				x: 0,
				y: 0,
				src: "./audios/voice.mp3",
			}),
			canvas,
		)

		expect(createElement).not.toHaveBeenCalledWith("audio")
		element.onMounted()
		expect(registerAudioElement).toHaveBeenCalledWith("audio-1", "./audios/voice.mp3")
		expect(createElement).not.toHaveBeenCalledWith("audio")

		element.destroy()
		expect(unregisterAudioElement).toHaveBeenCalledWith("audio-1")
		expect(unregisterPlayback).toHaveBeenCalledTimes(1)
		expect(unregisterFailure).toHaveBeenCalledTimes(1)
	})
})
