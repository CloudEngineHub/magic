import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EventEmitter } from "../../../core/EventEmitter"
import type { ImageResourceVariant, LoadedResource } from "../ImageResourceManager"
import {
	CanvasImagePresentationScheduler,
	type ImagePresentationTarget,
} from "../CanvasImagePresentationScheduler"

interface TestConsumer {
	getDisplayResourceVariant: () => ImageResourceVariant | undefined
	isImageLoaded: () => boolean
	applyPresentedResource: ReturnType<
		typeof vi.fn<(resource: LoadedResource, targetVariant: ImageResourceVariant) => boolean>
	>
}

function createResource(
	variant: ImageResourceVariant,
	options?: { width?: number; height?: number },
): LoadedResource {
	const width = options?.width ?? 100
	const height = options?.height ?? 100
	return {
		ossSrc: `https://example.test/${variant}.png`,
		image: { width, height } as unknown as ImageBitmap,
		imageInfo: {
			naturalWidth: width,
			naturalHeight: height,
			fileSize: width * height,
			mimeType: "image/png",
			filename: `${variant}.png`,
		},
		variant,
		sourceWidth: width,
		sourceHeight: height,
		isFullSize: variant === "full",
	}
}

function createConsumer(initialVariant?: ImageResourceVariant): TestConsumer {
	let displayedVariant = initialVariant
	return {
		getDisplayResourceVariant: () => displayedVariant,
		isImageLoaded: () => displayedVariant !== undefined,
		applyPresentedResource: vi.fn((resource) => {
			displayedVariant = resource.variant
			return true
		}),
	}
}

function createTarget(
	elementId: string,
	variant: ImageResourceVariant = "preview",
	path = `./images/${elementId}.png`,
	distanceToViewportCenter = 0,
): ImagePresentationTarget {
	return {
		elementId,
		path,
		variant,
		priority: "visible",
		distanceToViewportCenter,
	}
}

describe("CanvasImagePresentationScheduler", () => {
	let frameSequence = 0
	let frameCallbacks: Map<number, FrameRequestCallback>
	let cancelledFrames: Set<number>

	beforeEach(() => {
		frameSequence = 0
		frameCallbacks = new Map()
		cancelledFrames = new Set()
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn((callback: FrameRequestCallback) => {
				const frameId = ++frameSequence
				frameCallbacks.set(frameId, callback)
				return frameId
			}),
		)
		vi.stubGlobal(
			"cancelAnimationFrame",
			vi.fn((frameId: number) => {
				cancelledFrames.add(frameId)
				frameCallbacks.delete(frameId)
			}),
		)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	function runNextFrame(): void {
		const nextFrame = frameCallbacks.entries().next().value as
			[number, FrameRequestCallback] | undefined
		if (!nextFrame) return
		const [frameId, callback] = nextFrame
		frameCallbacks.delete(frameId)
		if (!cancelledFrames.has(frameId)) callback(performance.now())
	}

	function createScheduler(options?: {
		consumers?: Map<string, TestConsumer>
		cachedResources?: Map<string, LoadedResource>
	}) {
		const eventEmitter = new EventEmitter()
		const consumers = options?.consumers ?? new Map<string, TestConsumer>()
		const cachedResources = options?.cachedResources ?? new Map<string, LoadedResource>()
		const requestLayerDraw = vi.fn()
		const peekResource = vi.fn((path: string, loadOptions?: { variant?: string }) =>
			cachedResources.get(`${path}:${loadOptions?.variant ?? "preview"}`),
		)
		const canvas = {
			eventEmitter,
			magicConfigManager: { config: { methods: {} } },
			elementManager: {
				getElementInstance: (elementId: string) => consumers.get(elementId),
			},
			imageResourceManager: { peekResource },
			runtimeScheduler: { requestLayerDraw },
		}
		const scheduler = new CanvasImagePresentationScheduler({
			canvas: canvas as ConstructorParameters<
				typeof CanvasImagePresentationScheduler
			>[0]["canvas"],
		})
		return {
			cachedResources,
			consumers,
			eventEmitter,
			peekResource,
			requestLayerDraw,
			scheduler,
		}
	}

	it("keeps the best latest task for one element", () => {
		const consumer = createConsumer()
		const { eventEmitter, requestLayerDraw, scheduler } = createScheduler({
			consumers: new Map([["image-1", consumer]]),
		})
		scheduler.replaceTargets([createTarget("image-1", "preview")], "idle")

		const low = createResource("low")
		const preview = createResource("preview")
		eventEmitter.emit({
			type: "resource:image:loaded",
			data: { path: "./images/image-1.png", resource: low },
		})
		eventEmitter.emit({
			type: "resource:image:loaded",
			data: { path: "./images/image-1.png", resource: preview },
		})

		runNextFrame()

		expect(consumer.applyPresentedResource).toHaveBeenCalledTimes(1)
		expect(consumer.applyPresentedResource).toHaveBeenCalledWith(preview, "preview")
		expect(requestLayerDraw).toHaveBeenCalledTimes(1)
		expect(scheduler.getSnapshot()).toEqual(
			expect.objectContaining({
				pendingReplaceCount: 1,
				appliedPreviewCount: 1,
				pendingCount: 0,
			}),
		)
	})

	it("accepts directed full completions only for the matching target", () => {
		const consumer = createConsumer()
		const { eventEmitter, scheduler } = createScheduler({
			consumers: new Map([["image-1", consumer]]),
		})
		const full = createResource("full")
		scheduler.replaceTargets([createTarget("image-1", "full")], "idle")

		eventEmitter.emit({
			type: "resource:image:display-loaded",
			data: {
				elementId: "image-2",
				path: "./images/image-1.png",
				resource: full,
				reason: "viewport:idle-media",
			},
		})
		eventEmitter.emit({
			type: "resource:image:display-loaded",
			data: {
				elementId: "image-1",
				path: "./images/image-1.png",
				resource: full,
				reason: "viewport:idle-media",
			},
		})
		runNextFrame()

		expect(consumer.applyPresentedResource).toHaveBeenCalledTimes(1)
		expect(consumer.applyPresentedResource).toHaveBeenCalledWith(full, "full")
	})

	it("drops tasks when path, target generation, or element instance changes", () => {
		const firstConsumer = createConsumer()
		const replacementConsumer = createConsumer()
		const consumers = new Map<string, TestConsumer>([["image-1", firstConsumer]])
		const { eventEmitter, scheduler } = createScheduler({ consumers })
		scheduler.replaceTargets([createTarget("image-1", "preview", "./images/a.png")], "idle")
		eventEmitter.emit({
			type: "resource:image:loaded",
			data: { path: "./images/a.png", resource: createResource("preview") },
		})
		scheduler.replaceTargets([createTarget("image-1", "preview", "./images/b.png")], "idle")
		eventEmitter.emit({
			type: "resource:image:loaded",
			data: { path: "./images/a.png", resource: createResource("preview") },
		})
		runNextFrame()

		expect(firstConsumer.applyPresentedResource).not.toHaveBeenCalled()

		eventEmitter.emit({
			type: "resource:image:loaded",
			data: { path: "./images/b.png", resource: createResource("preview") },
		})
		consumers.set("image-1", replacementConsumer)
		runNextFrame()

		expect(firstConsumer.applyPresentedResource).not.toHaveBeenCalled()
		expect(replacementConsumer.applyPresentedResource).not.toHaveBeenCalled()
		expect(scheduler.getSnapshot().staleDropCount).toBe(2)
	})

	it("during movement blocks upgrades and only presents low for blank images", () => {
		const existingConsumer = createConsumer("low")
		const blankConsumer = createConsumer()
		const cachedPreview = createResource("preview")
		const { eventEmitter, scheduler } = createScheduler({
			consumers: new Map([
				["existing", existingConsumer],
				["blank", blankConsumer],
			]),
			cachedResources: new Map([["./images/existing.png:preview", cachedPreview]]),
		})
		scheduler.replaceTargets(
			[createTarget("existing", "preview"), createTarget("blank", "low")],
			"moving",
		)
		eventEmitter.emit({
			type: "resource:image:loaded",
			data: { path: "./images/blank.png", resource: createResource("preview") },
		})
		eventEmitter.emit({
			type: "resource:image:loaded",
			data: { path: "./images/blank.png", resource: createResource("low") },
		})
		runNextFrame()

		expect(existingConsumer.applyPresentedResource).not.toHaveBeenCalled()
		expect(blankConsumer.applyPresentedResource).toHaveBeenCalledTimes(1)
		expect(scheduler.getSnapshot()).toEqual(
			expect.objectContaining({
				movingUpgradeDeferredCount: 2,
				appliedLowCount: 1,
				appliedPreviewCount: 0,
				appliedFullCount: 0,
				movingAppliedLowCount: 1,
				movingAppliedPreviewCount: 0,
				movingAppliedFullCount: 0,
			}),
		)

		scheduler.replaceTargets(
			[createTarget("existing", "preview"), createTarget("blank", "preview")],
			"idle",
		)
		runNextFrame()

		expect(existingConsumer.applyPresentedResource).toHaveBeenCalledWith(
			cachedPreview,
			"preview",
		)
		expect(scheduler.getSnapshot()).toEqual(
			expect.objectContaining({
				idleAppliedPreviewCount: 1,
				movingAppliedPreviewCount: 0,
				movingAppliedFullCount: 0,
			}),
		)
	})

	it("applies the best cached fallback when idle targets arrive", () => {
		const previewConsumer = createConsumer()
		const fullConsumer = createConsumer()
		const cachedPreview = createResource("preview")
		const cachedFull = createResource("full")
		const { scheduler } = createScheduler({
			consumers: new Map([
				["image-1", previewConsumer],
				["image-2", fullConsumer],
			]),
			cachedResources: new Map([
				["./images/image-1.png:preview", cachedPreview],
				["./images/image-2.png:full", cachedFull],
			]),
		})

		scheduler.replaceTargets(
			[createTarget("image-1", "full"), createTarget("image-2", "full")],
			"idle",
		)
		runNextFrame()

		expect(previewConsumer.applyPresentedResource).toHaveBeenCalledWith(cachedPreview, "full")
		expect(fullConsumer.applyPresentedResource).toHaveBeenCalledWith(cachedFull, "full")
		expect(scheduler.getSnapshot().appliedPreviewCount).toBe(1)
		expect(scheduler.getSnapshot().appliedFullCount).toBe(1)
	})

	it("splits oversized presentation work across frames", () => {
		const consumers = new Map<string, TestConsumer>([
			["image-1", createConsumer()],
			["image-2", createConsumer()],
			["image-3", createConsumer()],
		])
		const { eventEmitter, requestLayerDraw, scheduler } = createScheduler({ consumers })
		scheduler.replaceTargets(
			[
				createTarget("image-1", "preview", undefined, 0),
				createTarget("image-2", "preview", undefined, 10),
				createTarget("image-3", "preview", undefined, 20),
			],
			"idle",
		)
		for (const elementId of consumers.keys()) {
			eventEmitter.emit({
				type: "resource:image:loaded",
				data: {
					path: `./images/${elementId}.png`,
					resource: createResource("preview", { width: 1200, height: 1200 }),
				},
			})
		}

		runNextFrame()
		expect(scheduler.getSnapshot().pendingCount).toBe(2)
		expect(requestLayerDraw).toHaveBeenCalledTimes(1)

		runNextFrame()
		expect(scheduler.getSnapshot().pendingCount).toBe(1)
		expect(requestLayerDraw).toHaveBeenCalledTimes(2)

		runNextFrame()
		expect(scheduler.getSnapshot().pendingCount).toBe(0)
		expect(requestLayerDraw).toHaveBeenCalledTimes(3)
	})

	it("requests one content draw for multiple applies in the same batch", () => {
		const consumers = new Map<string, TestConsumer>([
			["image-1", createConsumer()],
			["image-2", createConsumer()],
		])
		const { eventEmitter, requestLayerDraw, scheduler } = createScheduler({ consumers })
		scheduler.replaceTargets([createTarget("image-1"), createTarget("image-2")], "idle")
		for (const elementId of consumers.keys()) {
			eventEmitter.emit({
				type: "resource:image:loaded",
				data: {
					path: `./images/${elementId}.png`,
					resource: createResource("preview", { width: 500, height: 500 }),
				},
			})
		}

		runNextFrame()

		expect(consumers.get("image-1")?.applyPresentedResource).toHaveBeenCalledTimes(1)
		expect(consumers.get("image-2")?.applyPresentedResource).toHaveBeenCalledTimes(1)
		expect(requestLayerDraw).toHaveBeenCalledTimes(1)
		expect(requestLayerDraw).toHaveBeenCalledWith("content", {
			source: "CanvasImagePresentationScheduler",
			reason: "present-idle",
			priority: "normal",
		})
	})

	it("removes inactive targets and stops all work after destroy", () => {
		const consumer = createConsumer()
		const { eventEmitter, scheduler } = createScheduler({
			consumers: new Map([["image-1", consumer]]),
		})
		scheduler.replaceTargets([createTarget("image-1")], "idle")
		eventEmitter.emit({
			type: "resource:image:loaded",
			data: {
				path: "./images/image-1.png",
				resource: createResource("preview"),
			},
		})
		scheduler.removeTarget("image-1")
		runNextFrame()
		expect(consumer.applyPresentedResource).not.toHaveBeenCalled()

		scheduler.replaceTargets([createTarget("image-1")], "idle")
		eventEmitter.emit({
			type: "resource:image:loaded",
			data: {
				path: "./images/image-1.png",
				resource: createResource("preview"),
			},
		})
		scheduler.destroy()
		expect(cancelledFrames.size).toBe(1)

		eventEmitter.emit({
			type: "resource:image:loaded",
			data: {
				path: "./images/image-1.png",
				resource: createResource("preview"),
			},
		})
		runNextFrame()

		expect(consumer.applyPresentedResource).not.toHaveBeenCalled()
		expect(scheduler.getSnapshot()).toEqual(
			expect.objectContaining({ targetCount: 0, pendingCount: 0 }),
		)
	})
})
