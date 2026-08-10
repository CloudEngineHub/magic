import { afterEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { AudioReplaceController } from "../AudioReplaceController"

describe("AudioReplaceController", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("opens a single audio input and reports upload state transitions", async () => {
		const states: string[] = []
		const replaceAudioElement = vi.fn(async () => true)
		const inputClick = vi
			.spyOn(HTMLInputElement.prototype, "click")
			.mockImplementation(() => {})
		const container = document.createElement("div")
		const canvas = {
			container,
			readonly: false,
			t: vi.fn((_key: string, fallback: string) => fallback),
			eventEmitter: {
				emit: vi.fn(
					(event: { type: string; data: { elementId: string; status?: string } }) => {
						if (
							event.type === "element:audio:replaceStateChanged" &&
							event.data.status
						) {
							states.push(event.data.status)
						}
					},
				),
			},
			canvasFileUploadManager: {
				replaceAudioElement,
				replaceAudioElementFromProject: vi.fn(),
			},
		} as unknown as Canvas
		const controller = new AudioReplaceController({ canvas })
		controller.openLocalFilePicker("audio-1")

		const input = container.querySelector("input") as HTMLInputElement
		expect(input.accept).toContain("audio/*")
		expect(input.multiple).toBe(false)
		expect(inputClick).toHaveBeenCalledTimes(1)
		input.dataset.elementId = "audio-1"
		Object.defineProperty(input, "files", {
			configurable: true,
			value: [new File(["audio"], "voice.mp3", { type: "audio/mpeg" })],
		})
		input.dispatchEvent(new Event("change"))
		await Promise.resolve()
		await Promise.resolve()

		expect(replaceAudioElement).toHaveBeenCalledWith({
			elementId: "audio-1",
			file: expect.any(File),
		})
		expect(states).toEqual(["uploading", "idle"])

		controller.destroy()
		expect(container.querySelector("input")).toBeNull()
	})

	it("replaces audio from a project path through the same state lifecycle", async () => {
		const states: string[] = []
		const replaceAudioElementFromProject = vi.fn(() => true)
		const canvas = {
			container: document.createElement("div"),
			readonly: false,
			t: vi.fn((_key: string, fallback: string) => fallback),
			eventEmitter: {
				emit: vi.fn(
					(event: { type: string; data: { elementId: string; status?: string } }) => {
						if (
							event.type === "element:audio:replaceStateChanged" &&
							event.data.status
						) {
							states.push(event.data.status)
						}
					},
				),
			},
			canvasFileUploadManager: {
				replaceAudioElement: vi.fn(),
				replaceAudioElementFromProject,
			},
		} as unknown as Canvas
		const controller = new AudioReplaceController({ canvas })

		await expect(
			controller.replaceWithProjectFile("audio-1", "/audios/project.mp3"),
		).resolves.toBe(true)

		expect(replaceAudioElementFromProject).toHaveBeenCalledWith({
			elementId: "audio-1",
			path: "/audios/project.mp3",
		})
		expect(states).toEqual(["uploading", "idle"])
	})

	it("restores the source action after adding audio fails", async () => {
		const states: string[] = []
		const canvas = {
			container: document.createElement("div"),
			readonly: false,
			t: vi.fn((_key: string, fallback: string) => fallback),
			eventEmitter: {
				emit: vi.fn(
					(event: { type: string; data: { elementId: string; status?: string } }) => {
						if (
							event.type === "element:audio:replaceStateChanged" &&
							event.data.status
						) {
							states.push(event.data.status)
						}
					},
				),
			},
			canvasFileUploadManager: {
				replaceAudioElement: vi.fn(),
				replaceAudioElementFromProject: vi.fn(() => false),
			},
		} as unknown as Canvas
		const controller = new AudioReplaceController({ canvas })

		await expect(
			controller.replaceWithProjectFile("audio-empty", "/audios/project.mp3"),
		).resolves.toBe(false)

		expect(states).toEqual(["uploading", "error"])
	})
})
