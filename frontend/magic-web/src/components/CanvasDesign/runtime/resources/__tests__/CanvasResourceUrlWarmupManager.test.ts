import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "../../core/EventEmitter"
import { ElementTypeEnum, type LayerElement } from "../../document/types"
import type { Canvas } from "../../core/Canvas"
import { CanvasResourceUrlWarmupManager } from "../scheduler/CanvasResourceUrlWarmupManager"

function createImage(id: string, src: string): LayerElement {
	return {
		id,
		type: ElementTypeEnum.Image,
		src,
	}
}

function createVideo(id: string, src: string): LayerElement {
	return {
		id,
		type: ElementTypeEnum.Video,
		src,
	}
}

function createCanvasMock(elements: Record<string, LayerElement>, getFileInfo = vi.fn()) {
	const eventEmitter = new EventEmitter()
	const imageResourceManager = {
		markResourceLoadFailed: vi.fn(),
	}
	return {
		id: "canvas-1",
		eventEmitter,
		elementManager: {
			getElementsDict: () => elements,
			getElementData: (elementId: string) => elements[elementId],
		},
		magicConfigManager: {
			config: {
				methods: {
					getFileInfo,
					resolveAbsolutePath: (path: string) => `/project/${path.replace(/^\.\/+/, "")}`,
				},
			},
		},
		imageResourceManager,
	}
}

async function flushWarmupTimer(): Promise<void> {
	await vi.advanceTimersByTimeAsync(80)
	await Promise.resolve()
	await Promise.resolve()
}

describe("CanvasResourceUrlWarmupManager", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("warms image and video URLs without requesting media body resources", async () => {
		const getFileInfo = vi.fn(async (path: string) => ({
			src: `https://example.test/${path}`,
			fileName: path,
		}))
		const elements = {
			image: createImage("image", "./images/a.png"),
			video: createVideo("video", "./videos/a.mp4"),
		}
		const manager = new CanvasResourceUrlWarmupManager({
			canvas: createCanvasMock(elements, getFileInfo) as unknown as Canvas,
		})

		manager.warmupCurrentDocument("test")
		await flushWarmupTimer()

		expect(getFileInfo).toHaveBeenCalledTimes(2)
		expect(getFileInfo).toHaveBeenCalledWith("./images/a.png", {
			useImageProcess: true,
			forceRefresh: false,
		})
		expect(getFileInfo).toHaveBeenCalledWith("./videos/a.mp4", {
			useImageProcess: false,
			forceRefresh: false,
		})
		expect(manager.getSnapshot()).toMatchObject({
			readyCount: 2,
			successCount: 2,
			queuedCount: 0,
			warmingCount: 0,
		})
		manager.destroy()
	})

	it("dedupes the same canonical resource path", async () => {
		const getFileInfo = vi.fn(async (path: string) => ({
			src: `https://example.test/${path}`,
			fileName: path,
		}))
		const elements = {
			imageA: createImage("imageA", "./images/a.png"),
			imageB: createImage("imageB", "images/a.png"),
		}
		const manager = new CanvasResourceUrlWarmupManager({
			canvas: createCanvasMock(elements, getFileInfo) as unknown as Canvas,
		})

		manager.warmupCurrentDocument("test")
		await flushWarmupTimer()

		expect(getFileInfo).toHaveBeenCalledTimes(1)
		expect(manager.getSnapshot()).toMatchObject({
			trackedPathCount: 1,
			registeredElementCount: 2,
			readyCount: 1,
		})
		manager.destroy()
	})

	it("keeps ready warmup entries until their URL expires", async () => {
		vi.setSystemTime(new Date("2026-01-01T00:00:00"))
		const getFileInfo = vi.fn(async (path: string) => ({
			src: `https://example.test/${path}`,
			fileName: path,
			expires_at: "2026-01-01 00:00:10",
		}))
		const elements = {
			image: createImage("image", "./images/a.png"),
		}
		const manager = new CanvasResourceUrlWarmupManager({
			canvas: createCanvasMock(elements, getFileInfo) as unknown as Canvas,
		})

		manager.warmupCurrentDocument("initial")
		await flushWarmupTimer()
		manager.warmupCurrentDocument("still-fresh")
		await flushWarmupTimer()

		expect(getFileInfo).toHaveBeenCalledTimes(1)

		vi.setSystemTime(new Date("2026-01-01T00:00:11"))
		manager.warmupCurrentDocument("expired")
		await flushWarmupTimer()

		expect(getFileInfo).toHaveBeenCalledTimes(2)
		expect(manager.getSnapshot()).toMatchObject({
			readyCount: 1,
			successCount: 2,
		})
		manager.destroy()
	})

	it("retries failed warmup entries after the retry delay", async () => {
		const getFileInfo = vi
			.fn()
			.mockRejectedValueOnce(new Error("network failed"))
			.mockResolvedValue({
				src: "https://example.test/images/a.png",
				fileName: "a.png",
			})
		const elements = {
			image: createImage("image", "./images/a.png"),
		}
		const manager = new CanvasResourceUrlWarmupManager({
			canvas: createCanvasMock(elements, getFileInfo) as unknown as Canvas,
		})

		manager.warmupCurrentDocument("initial")
		await flushWarmupTimer()

		expect(getFileInfo).toHaveBeenCalledTimes(1)
		expect(manager.getSnapshot()).toMatchObject({
			failedCount: 1,
			failedRequestCount: 1,
		})

		manager.warmupCurrentDocument("too-soon")
		await flushWarmupTimer()
		expect(getFileInfo).toHaveBeenCalledTimes(1)

		await vi.advanceTimersByTimeAsync(30_000)
		manager.warmupCurrentDocument("retry")
		await flushWarmupTimer()

		expect(getFileInfo).toHaveBeenCalledTimes(2)
		expect(manager.getSnapshot()).toMatchObject({
			readyCount: 1,
			failedCount: 0,
			successCount: 1,
		})
		manager.destroy()
	})

	it("propagates failed image warmup to the image resource manager", async () => {
		const getFileInfo = vi.fn(async () => {
			throw new Error("未找到路径对应的文件: ./images/missing.png")
		})
		const elements = {
			image: createImage("image", "./images/missing.png"),
		}
		const canvas = createCanvasMock(elements, getFileInfo)
		const manager = new CanvasResourceUrlWarmupManager({
			canvas: canvas as unknown as Canvas,
		})

		manager.warmupCurrentDocument("initial")
		await flushWarmupTimer()

		expect(canvas.imageResourceManager.markResourceLoadFailed).toHaveBeenCalledWith(
			"./images/missing.png",
			"not-found",
		)
		manager.destroy()
	})
})
