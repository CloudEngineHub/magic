import { describe, expect, it, vi } from "vitest"
import { ElementTypeEnum, type ImageElement } from "../../document/types"
import { GenerationStatus } from "../../../public/magic-types"
import { ImagePollingManager } from "../polling/ImagePollingManager"

function createImageElement(overrides?: Partial<ImageElement>): ImageElement {
	return {
		id: "image-element-1",
		type: ElementTypeEnum.Image,
		x: 0,
		y: 0,
		width: 512,
		height: 512,
		zIndex: 1,
		generateImageRequest: {
			image_id: "image-task-1",
			model_id: "model-1",
			prompt: "pikachu",
		},
		...overrides,
	}
}

function createDeferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, resolve, reject }
}

describe("ImagePollingManager", () => {
	it("recovers an Agent-produced file without calling the Design result API", async () => {
		const element = createImageElement({ status: GenerationStatus.Processing })
		const getImageGenerationResult = vi.fn()
		const getFileInfo = vi.fn(async (path: string) => {
			if (path === "images/image-task-1.png") {
				return {
					src: "https://example.test/image-task-1.png",
					fileName: "image-task-1.png",
				}
			}
			throw new Error("not found")
		})
		const update = vi.fn((elementId: string, updates: Partial<ImageElement>) => {
			if (elementId === element.id) Object.assign(element, updates)
		})
		const primeCache = vi.fn()
		const emit = vi.fn()
		const canvas = {
			elementDetailsRuntimeManager: {
				getGenerateImageRequestImageIdSource: vi.fn(() => "agent"),
			},
			magicConfigManager: {
				config: { methods: { getImageGenerationResult, getFileInfo } },
			},
			elementManager: { update },
			imageResourceManager: { primeCache },
			eventEmitter: { emit },
		}

		const manager = new ImagePollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})
		manager.start()

		await vi.waitFor(() => expect(update).toHaveBeenCalled())
		expect(getImageGenerationResult).not.toHaveBeenCalled()
		expect(update).toHaveBeenCalledWith(
			element.id,
			{
				src: "images/image-task-1.png",
				status: GenerationStatus.Completed,
				errorMessage: undefined,
			},
			{ silent: false },
		)
		expect(primeCache).toHaveBeenCalledWith("images/image-task-1.png", {
			src: "https://example.test/image-task-1.png",
			fileName: "image-task-1.png",
			resource_version: "generated:image-task-1.png",
		})
	})

	it("does not call or clear anything when an Agent file is not yet visible", async () => {
		const element = createImageElement({ status: GenerationStatus.Processing })
		const getImageGenerationResult = vi.fn()
		const getFileInfo = vi.fn().mockRejectedValue(new Error("not found"))
		const update = vi.fn()
		const canvas = {
			elementDetailsRuntimeManager: {
				getGenerateImageRequestImageIdSource: vi.fn(() => "agent"),
			},
			magicConfigManager: {
				config: { methods: { getImageGenerationResult, getFileInfo } },
			},
			elementManager: { update, delete: vi.fn() },
			imageResourceManager: { primeCache: vi.fn() },
			eventEmitter: { emit: vi.fn() },
		}

		const manager = new ImagePollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})
		manager.start()

		await vi.waitFor(() => expect(getFileInfo).toHaveBeenCalledTimes(8))
		expect(getImageGenerationResult).not.toHaveBeenCalled()
		expect(update).not.toHaveBeenCalled()
		expect(manager.isActive()).toBe(false)
	})

	it("discards an Agent recovery result when the element switches to another image_id", async () => {
		const element = createImageElement({ status: GenerationStatus.Processing })
		const fileInfo = createDeferred<{ src: string; fileName: string }>()
		const getFileInfo = vi.fn((path: string) => {
			if (path === "images/image-task-1.png") return fileInfo.promise
			return Promise.reject(new Error("not found"))
		})
		const update = vi.fn()
		const canvas = {
			elementDetailsRuntimeManager: {
				getGenerateImageRequestImageIdSource: vi.fn(() => "agent"),
			},
			magicConfigManager: {
				config: { methods: { getFileInfo } },
			},
			elementManager: { update },
			imageResourceManager: { primeCache: vi.fn() },
			eventEmitter: { emit: vi.fn() },
		}

		const manager = new ImagePollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})
		manager.start()

		await vi.waitFor(() => expect(getFileInfo).toHaveBeenCalled())
		element.generateImageRequest = {
			...element.generateImageRequest,
			image_id: "image-task-2",
		}
		fileInfo.resolve({
			src: "https://example.test/image-task-1.png",
			fileName: "image-task-1.png",
		})

		await vi.waitFor(() => expect(manager.isActive()).toBe(false))
		expect(update).not.toHaveBeenCalled()
	})

	it("does not overwrite a src added by Agent while file lookup is pending", async () => {
		const element = createImageElement({ status: GenerationStatus.Processing })
		const fileInfo = createDeferred<{ src: string; fileName: string }>()
		const getFileInfo = vi.fn(() => fileInfo.promise)
		const update = vi.fn()
		const canvas = {
			elementDetailsRuntimeManager: {
				getGenerateImageRequestImageIdSource: vi.fn(() => "agent"),
			},
			magicConfigManager: {
				config: { methods: { getFileInfo } },
			},
			elementManager: { update },
			imageResourceManager: { primeCache: vi.fn() },
			eventEmitter: { emit: vi.fn() },
		}

		const manager = new ImagePollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})
		manager.start()

		await vi.waitFor(() => expect(getFileInfo).toHaveBeenCalled())
		element.src = "./images/agent-final.png"
		element.status = GenerationStatus.Completed
		fileInfo.resolve({
			src: "https://example.test/image-task-1.png",
			fileName: "image-task-1.png",
		})

		await vi.waitFor(() => expect(manager.isActive()).toBe(false))
		expect(update).not.toHaveBeenCalled()
	})

	it("invalidates an in-flight Agent recovery when polling is stopped", async () => {
		const element = createImageElement({ status: GenerationStatus.Processing })
		const fileInfo = createDeferred<{ src: string; fileName: string }>()
		const getFileInfo = vi.fn(() => fileInfo.promise)
		const update = vi.fn()
		const canvas = {
			elementDetailsRuntimeManager: {
				getGenerateImageRequestImageIdSource: vi.fn(() => "agent"),
			},
			magicConfigManager: {
				config: { methods: { getFileInfo } },
			},
			elementManager: { update },
			imageResourceManager: { primeCache: vi.fn() },
			eventEmitter: { emit: vi.fn() },
		}

		const manager = new ImagePollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})
		manager.start()

		await vi.waitFor(() => expect(getFileInfo).toHaveBeenCalled())
		manager.stop()
		fileInfo.resolve({
			src: "https://example.test/image-task-1.png",
			fileName: "image-task-1.png",
		})

		await Promise.resolve()
		expect(update).not.toHaveBeenCalled()
	})

	it("restarts Agent recovery for a new image_id after an element update", async () => {
		const element = createImageElement({ status: GenerationStatus.Processing })
		const firstFileInfo = createDeferred<{ src: string; fileName: string }>()
		const getFileInfo = vi.fn((path: string) => {
			if (path === "images/image-task-1.png") return firstFileInfo.promise
			if (path === "images/image-task-2.png") {
				return Promise.resolve({
					src: "https://example.test/image-task-2.png",
					fileName: "image-task-2.png",
				})
			}
			return Promise.reject(new Error("not found"))
		})
		const update = vi.fn((elementId: string, updates: Partial<ImageElement>) => {
			if (elementId === element.id) Object.assign(element, updates)
		})
		let elementUpdatedListener: ((event: { data: { elementId: string } }) => void) | undefined
		const eventEmitter = {
			emit: vi.fn(),
			on: vi.fn(
				(
					_event: "element:updated",
					listener: (event: { data: { elementId: string } }) => void,
				) => {
					elementUpdatedListener = listener
					return vi.fn()
				},
			),
		}
		const canvas = {
			elementDetailsRuntimeManager: {
				getGenerateImageRequestImageIdSource: vi.fn(() => "agent"),
			},
			magicConfigManager: {
				config: { methods: { getFileInfo } },
			},
			elementManager: { update },
			imageResourceManager: { primeCache: vi.fn() },
			eventEmitter,
		}

		const manager = new ImagePollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})
		manager.start()

		await vi.waitFor(() =>
			expect(getFileInfo).toHaveBeenCalledWith("images/image-task-1.png", expect.any(Object)),
		)
		element.generateImageRequest = {
			...element.generateImageRequest,
			image_id: "image-task-2",
		}
		elementUpdatedListener?.({ data: { elementId: element.id } })

		await vi.waitFor(() =>
			expect(update).toHaveBeenCalledWith(
				element.id,
				{
					src: "images/image-task-2.png",
					status: GenerationStatus.Completed,
					errorMessage: undefined,
				},
				{ silent: false },
			),
		)
		firstFileInfo.resolve({
			src: "https://example.test/image-task-1.png",
			fileName: "image-task-1.png",
		})
		await Promise.resolve()

		expect(update).toHaveBeenCalledTimes(1)
	})

	it("stops an unknown generateImageRequest without querying the Design result API", async () => {
		const element = createImageElement({ status: GenerationStatus.Processing })
		const getImageGenerationResult = vi.fn()
		const canvas = {
			elementDetailsRuntimeManager: {
				getGenerateImageRequestImageIdSource: vi.fn(() => "unknown"),
			},
			magicConfigManager: { config: { methods: { getImageGenerationResult } } },
			elementManager: { update: vi.fn(), delete: vi.fn() },
			imageResourceManager: { primeCache: vi.fn() },
			eventEmitter: { emit: vi.fn() },
		}

		const manager = new ImagePollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})
		manager.start()

		await vi.waitFor(() => expect(manager.isActive()).toBe(false))
		expect(getImageGenerationResult).not.toHaveBeenCalled()
	})

	it("keeps polling frontend imageGenerationTaskMeta even without sidecar provenance", async () => {
		const element = createImageElement({
			generateImageRequest: undefined,
			imageGenerationTaskMeta: { type: "high", image_id: "high-task-1" },
			status: GenerationStatus.Processing,
		})
		const getImageGenerationResult = vi.fn().mockResolvedValue({
			image_id: "high-task-1",
			status: GenerationStatus.Completed,
			file_dir: "/images/",
			file_name: "high.png",
			file_url: "https://example.test/high.png",
			error_message: null,
		})
		const update = vi.fn((elementId: string, updates: Partial<ImageElement>) => {
			if (elementId === element.id) Object.assign(element, updates)
		})
		const canvas = {
			elementDetailsRuntimeManager: {
				getGenerateImageRequestImageIdSource: vi.fn(() => "unknown"),
			},
			magicConfigManager: { config: { methods: { getImageGenerationResult } } },
			elementManager: { update },
			imageResourceManager: { primeCache: vi.fn() },
			eventEmitter: { emit: vi.fn() },
		}

		const manager = new ImagePollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})
		manager.start()

		await vi.waitFor(() => expect(update).toHaveBeenCalled())
		expect(getImageGenerationResult).toHaveBeenCalledWith({ image_id: "high-task-1" })
	})

	it("primes generated image metadata and leaves loading to visibility scheduling", async () => {
		const element = createImageElement()
		const getImageGenerationResult = vi.fn().mockResolvedValue({
			image_id: "image-task-1",
			status: GenerationStatus.Completed,
			file_dir: "/images/",
			file_name: "generated.png",
			file_url: "https://example.test/generated.png",
			error_message: null,
		})
		const update = vi.fn((elementId: string, updates: Partial<ImageElement>) => {
			if (elementId === element.id) {
				Object.assign(element, updates)
			}
		})
		const primeCache = vi.fn()
		const loadResource = vi.fn()
		const emit = vi.fn()
		const canvas = {
			magicConfigManager: {
				config: {
					methods: {
						getImageGenerationResult,
					},
				},
			},
			elementManager: {
				update,
			},
			imageResourceManager: {
				primeCache,
				loadResource,
			},
			eventEmitter: {
				emit,
			},
		}

		const manager = new ImagePollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})

		manager.start()

		await vi.waitFor(() => {
			expect(update).toHaveBeenCalled()
		})

		expect(primeCache).toHaveBeenCalledWith("images/generated.png", {
			src: "https://example.test/generated.png",
			fileName: "generated.png",
			resource_version: "generated:generated.png",
		})
		expect(loadResource).not.toHaveBeenCalled()
		expect(emit).toHaveBeenCalledWith({
			type: "element:image:resultUpdated",
			data: { elementId: element.id },
		})
	})

	it("clears a persisted image task when the backend confirms that exact task is missing", async () => {
		const element = createImageElement({ status: GenerationStatus.Processing })
		const update = vi.fn((elementId: string, updates: Partial<ImageElement>) => {
			if (elementId === element.id) Object.assign(element, updates)
		})
		const deleteElement = vi.fn()
		const emit = vi.fn()
		const canvas = {
			magicConfigManager: {
				config: {
					methods: {
						getImageGenerationResult: vi.fn().mockRejectedValue({
							code: 14000,
							message: "image-task-1 未找到",
						}),
					},
				},
			},
			elementManager: { update, delete: deleteElement },
			eventEmitter: { emit },
		}

		const manager = new ImagePollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})

		manager.start()

		await vi.waitFor(() => expect(update).toHaveBeenCalled())
		expect(update).toHaveBeenCalledWith(
			element.id,
			{
				generateImageRequest: undefined,
				status: undefined,
				errorMessage: undefined,
			},
			{ silent: false },
		)
		expect(deleteElement).not.toHaveBeenCalled()
		expect(emit).toHaveBeenCalledWith({
			type: "element:image:generate-submit-failed",
			data: { elementId: element.id },
		})
	})
})
