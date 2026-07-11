import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
	TemplateColorExtractionRequest,
	TemplateColorExtractionResponse,
} from "../templateColorExtractionProtocol"

class FakeWorker {
	static instances: FakeWorker[] = []

	onerror: ((event: ErrorEvent) => void) | null = null
	onmessage: ((event: MessageEvent<TemplateColorExtractionResponse>) => void) | null = null
	readonly requests: TemplateColorExtractionRequest[] = []

	constructor() {
		FakeWorker.instances.push(this)
	}

	postMessage(request: TemplateColorExtractionRequest) {
		this.requests.push(request)
	}

	respond(colors: string[], error?: string) {
		const request = this.requests[this.requests.length - 1]
		if (!request) throw new Error("No template color request to resolve")
		this.onmessage?.({
			data: { colors, error, requestId: request.requestId },
		} as MessageEvent<TemplateColorExtractionResponse>)
	}

	terminate() {
		return undefined
	}
}

describe("template color extraction store", () => {
	beforeEach(() => {
		FakeWorker.instances = []
		vi.resetModules()
		vi.stubGlobal("Worker", FakeWorker)
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it("deduplicates image work, runs one task at a time, and prioritizes interactions", async () => {
		const store = await import("../templateColorExtractionStore")
		const firstUrl = "https://example.com/first.png"
		const secondUrl = "https://example.com/second.png"
		const interactiveUrl = "https://example.com/interactive.png"
		const firstListener = vi.fn()
		store.subscribeTemplateColorExtraction(firstUrl, firstListener)

		store.requestTemplateColorExtraction(firstUrl, "background")
		store.requestTemplateColorExtraction(firstUrl, "interactive")
		store.requestTemplateColorExtraction(secondUrl, "background")
		store.requestTemplateColorExtraction(interactiveUrl, "interactive")

		const worker = FakeWorker.instances[0]
		expect(worker?.requests.map(({ imageUrl }) => imageUrl)).toEqual([firstUrl])

		worker?.respond(["#315ECA", "#7AA7FF", "#182A5A"])
		expect(store.getExtractedTemplateColors(firstUrl)).toEqual([
			"#315ECA",
			"#7AA7FF",
			"#182A5A",
		])
		expect(firstListener).toHaveBeenCalledTimes(1)
		expect(worker?.requests.map(({ imageUrl }) => imageUrl)).toEqual([firstUrl, interactiveUrl])

		worker?.respond(["#D97706", "#FACC15", "#7C2D12"])
		expect(worker?.requests.map(({ imageUrl }) => imageUrl)).toEqual([
			firstUrl,
			interactiveUrl,
			secondUrl,
		])
		worker?.respond(["#111111", "#555555", "#999999"])
	})

	it("drops queued background work when similar-color mode closes", async () => {
		const store = await import("../templateColorExtractionStore")
		const activeUrl = "https://example.com/active.png"
		const queuedUrl = "https://example.com/queued.png"

		store.requestTemplateColorExtraction(activeUrl, "background")
		store.requestTemplateColorExtraction(queuedUrl, "background")
		store.clearTemplateColorExtractionBackgroundQueue()

		const worker = FakeWorker.instances[0]
		worker?.respond(["#315ECA", "#7AA7FF", "#182A5A"])

		expect(worker?.requests.map(({ imageUrl }) => imageUrl)).toEqual([activeUrl])
	})

	it("reports task settlement without publishing failed results to the template wall", async () => {
		const store = await import("../templateColorExtractionStore")
		const publishedListener = vi.fn()
		const settledListener = vi.fn()
		store.subscribeTemplateColorExtractionChanges(publishedListener)
		store.subscribeTemplateColorExtractionSettled(settledListener)
		store.requestTemplateColorExtraction("https://example.com/cors-failure.png", "background")

		FakeWorker.instances[0]?.respond([], "Image fetch failed")

		expect(settledListener).toHaveBeenCalledTimes(1)
		expect(publishedListener).not.toHaveBeenCalled()
		expect(store.getTemplateColorExtractionVersion()).toBe(0)
	})

	it("publishes multiple successful colors to the filter in one batch", async () => {
		vi.useFakeTimers()
		const store = await import("../templateColorExtractionStore")
		const publishedListener = vi.fn()
		store.subscribeTemplateColorExtractionChanges(publishedListener)
		store.requestTemplateColorExtraction("https://example.com/first-batch.png", "background")
		store.requestTemplateColorExtraction("https://example.com/second-batch.png", "background")

		const worker = FakeWorker.instances[0]
		worker?.respond(["#315ECA", "#7AA7FF", "#182A5A"])
		worker?.respond(["#D97706", "#FACC15", "#7C2D12"])

		expect(publishedListener).not.toHaveBeenCalled()
		vi.advanceTimersByTime(1_199)
		expect(publishedListener).not.toHaveBeenCalled()
		vi.advanceTimersByTime(1)

		expect(publishedListener).toHaveBeenCalledTimes(1)
		expect(store.getTemplateColorExtractionVersion()).toBe(1)
	})
})
