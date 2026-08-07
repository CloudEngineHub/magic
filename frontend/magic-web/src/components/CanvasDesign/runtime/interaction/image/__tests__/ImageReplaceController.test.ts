import { afterEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { ImageReplaceController } from "../ImageReplaceController"

describe("ImageReplaceController", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("opens a single image input and reports upload state transitions", async () => {
		const states: string[] = []
		const replaceImageElement = vi.fn(async () => true)
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
							event.type === "element:image:replaceStateChanged" &&
							event.data.status
						) {
							states.push(event.data.status)
						}
					},
				),
			},
			canvasFileUploadManager: {
				replaceImageElement,
				replaceImageElementFromProject: vi.fn(),
			},
		} as unknown as Canvas
		const controller = new ImageReplaceController({ canvas })
		controller.openLocalFilePicker("image-1", null)

		const input = container.querySelector("input") as HTMLInputElement
		expect(input.accept).toContain("image/*")
		expect(input.multiple).toBe(false)
		expect(inputClick).toHaveBeenCalledTimes(1)
		input.dataset.elementId = "image-1"
		Object.defineProperty(input, "files", {
			configurable: true,
			value: [new File(["image"], "photo.png", { type: "image/png" })],
		})
		input.dispatchEvent(new Event("change"))
		await Promise.resolve()
		await Promise.resolve()

		expect(replaceImageElement).toHaveBeenCalledWith({
			elementId: "image-1",
			file: expect.any(File),
			versionId: null,
		})
		expect(states).toEqual(["uploading", "idle"])

		controller.destroy()
		expect(container.querySelector("input")).toBeNull()
	})

	it("replaces an image from a project path through the same state lifecycle", async () => {
		const states: string[] = []
		const replaceImageElementFromProject = vi.fn(() => true)
		const canvas = {
			container: document.createElement("div"),
			readonly: false,
			t: vi.fn((_key: string, fallback: string) => fallback),
			eventEmitter: {
				emit: vi.fn(
					(event: { type: string; data: { elementId: string; status?: string } }) => {
						if (
							event.type === "element:image:replaceStateChanged" &&
							event.data.status
						) {
							states.push(event.data.status)
						}
					},
				),
			},
			canvasFileUploadManager: {
				replaceImageElement: vi.fn(),
				replaceImageElementFromProject,
			},
		} as unknown as Canvas
		const controller = new ImageReplaceController({ canvas })

		await expect(
			controller.replaceWithProjectFile("image-1", "/images/project.png", "version-1"),
		).resolves.toBe(true)

		expect(replaceImageElementFromProject).toHaveBeenCalledWith({
			elementId: "image-1",
			path: "/images/project.png",
			versionId: "version-1",
		})
		expect(states).toEqual(["uploading", "idle"])
	})
})
