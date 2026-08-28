import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SlideItem } from "../../PPTSidebar/types"
import { PPTStore } from "../PPTStore"

interface PendingScreenshot {
	resolve: (thumbnailUrl: string) => void
	reject: (error: Error) => void
}

interface ScreenshotServiceMock {
	pending: PendingScreenshot[]
	generateScreenshot: ReturnType<typeof vi.fn>
	cancelPreviewGenerations: ReturnType<typeof vi.fn>
	releaseScreenshot: ReturnType<typeof vi.fn>
	clearCache: ReturnType<typeof vi.fn>
	getCacheStats: ReturnType<typeof vi.fn>
	reset: ReturnType<typeof vi.fn>
	dispose: ReturnType<typeof vi.fn>
}

const screenshotState = vi.hoisted(() => {
	const instances: ScreenshotServiceMock[] = []
	const legacyGlobalService = {
		generateScreenshot: vi.fn(),
		cancelPreviewGenerations: vi.fn(),
		releaseScreenshot: vi.fn(),
		clearCache: vi.fn(),
		getCacheStats: vi.fn(() => ({ size: 0, urls: [] })),
		reset: vi.fn(),
		dispose: vi.fn(),
	}
	const createScreenshotService = vi.fn(() => {
		const pending: PendingScreenshot[] = []
		const service: ScreenshotServiceMock = {
			pending,
			generateScreenshot: vi.fn(
				() =>
					new Promise<string>((resolve, reject) => {
						pending.push({ resolve, reject })
					}),
			),
			cancelPreviewGenerations: vi.fn(),
			releaseScreenshot: vi.fn(),
			clearCache: vi.fn(),
			getCacheStats: vi.fn(() => ({ size: 0, urls: [] })),
			reset: vi.fn(),
			dispose: vi.fn(),
		}
		instances.push(service)
		return service
	})

	return { createScreenshotService, instances, legacyGlobalService }
})

vi.mock("../../services/SlideScreenshotService", () => ({
	SlideScreenshotService: class SlideScreenshotService {},
	createScreenshotService: screenshotState.createScreenshotService,
	getScreenshotService: () => screenshotState.legacyGlobalService,
}))

function createSlide(id: string, content: string): SlideItem {
	return {
		id,
		path: "01.html",
		url: "https://example.com/01.html",
		index: 0,
		content,
		loadingState: "loaded",
	}
}

describe("PPTStore screenshot lifecycle", () => {
	const stores: PPTStore[] = []

	function createStore(mainFileId: string): PPTStore {
		const store = new PPTStore({
			mainFileId,
			mainFileName: "index.html",
			autoLoadAndGenerate: false,
			enableCache: false,
			logger: { enabled: false },
		})
		stores.push(store)
		return store
	}

	beforeEach(() => {
		vi.clearAllMocks()
		screenshotState.instances.splice(0)
		delete (window as typeof window & { pptStore?: PPTStore }).pptStore
	})

	afterEach(() => {
		stores.splice(0).forEach((store) => store.dispose())
		delete (window as typeof window & { pptStore?: PPTStore }).pptStore
	})

	it("disposes only its own screenshot service and prevents late writes", async () => {
		const storeA = createStore("deck-a")
		const storeB = createStore("deck-b")
		const serviceA = screenshotState.instances[0]
		const serviceB = screenshotState.instances[1]
		const slideA = createSlide("slide-a", "<div>A</div>")
		const slideB = createSlide("slide-b", "<div>B</div>")
		storeA.setSlides([slideA], true)
		storeB.setSlides([slideB], true)
		const storedSlideA = storeA.slides[0]
		const storedSlideB = storeB.slides[0]

		const generationA = storeA.generateSlideScreenshot(0)
		const generationB = storeB.generateSlideScreenshot(0)
		expect(serviceA.pending).toHaveLength(1)
		expect(serviceB.pending).toHaveLength(1)

		storeA.dispose()
		storeA.dispose()

		expect(serviceA.dispose).toHaveBeenCalledTimes(1)
		expect(serviceB.dispose).not.toHaveBeenCalled()
		expect((window as typeof window & { pptStore?: PPTStore }).pptStore).toBe(storeB)

		await storeA.generateSlideScreenshot(0)
		await storeA.generateAllScreenshots()
		await storeA.ensureSlideScreenshot(0)
		expect(serviceA.generateScreenshot).toHaveBeenCalledTimes(1)

		serviceB.pending[0]?.resolve("blob:deck-b")
		await generationB
		expect(storedSlideB.thumbnailUrl).toBe("blob:deck-b")

		serviceA.pending[0]?.resolve("blob:late-deck-a")
		await generationA
		expect(storedSlideA.thumbnailUrl).toBeUndefined()
		expect(storedSlideA.thumbnailLoading).toBe(false)
		expect(storedSlideA.thumbnailError).toBeUndefined()
		expect(serviceA.releaseScreenshot).toHaveBeenCalledWith("blob:late-deck-a")
		expect(screenshotState.legacyGlobalService.generateScreenshot).not.toHaveBeenCalled()
	})

	it("resets old deck screenshots without preventing new deck generation", async () => {
		const store = createStore("deck-a")
		const service = screenshotState.instances[0]
		const oldSlide = createSlide("old-slide", "<div>old</div>")
		store.setSlides([oldSlide], true)
		const storedOldSlide = store.slides[0]
		const oldGeneration = store.generateSlideScreenshot(0)

		await store.initializeSlides([])

		expect(service.reset).toHaveBeenCalledTimes(1)
		expect(service.dispose).not.toHaveBeenCalled()
		expect(storedOldSlide.thumbnailUrl).toBeUndefined()
		expect(storedOldSlide.thumbnailLoading).toBe(false)

		const newSlide = createSlide("new-slide", "<div>new</div>")
		store.setSlides([newSlide], true)
		const storedNewSlide = store.slides[0]
		service.pending[0]?.resolve("blob:late-old-deck")
		await oldGeneration

		expect(storedNewSlide.thumbnailUrl).toBeUndefined()
		expect(service.releaseScreenshot).toHaveBeenCalledWith("blob:late-old-deck")

		const newGeneration = store.generateSlideScreenshot(0)
		service.pending[1]?.resolve("blob:new-deck")
		await newGeneration
		expect(storedNewSlide.thumbnailUrl).toBe("blob:new-deck")
	})

	it("keeps a newer same-key generation marker when the old deck settles late", async () => {
		const store = createStore("deck-a")
		const service = screenshotState.instances[0]
		store.setSlides([createSlide("old-slide", "<div>old</div>")], true)
		const oldGeneration = store.ensureSlideScreenshot(0)

		await store.initializeSlides([])
		store.setSlides([createSlide("new-slide", "<div>new</div>")], true)
		const storedNewSlide = store.slides[0]
		const newGeneration = store.ensureSlideScreenshot(0)
		const generationMarkers = (
			store as unknown as { generatingScreenshots: Map<string, symbol> }
		).generatingScreenshots
		expect(generationMarkers.size).toBe(1)

		service.pending[0]?.resolve("blob:late-old-deck")
		await oldGeneration
		expect(generationMarkers.size).toBe(1)

		service.pending[1]?.resolve("blob:new-deck")
		await newGeneration
		expect(generationMarkers.size).toBe(0)
		expect(storedNewSlide.thumbnailUrl).toBe("blob:new-deck")
	})

	it("does not reset the whole screenshot service for an equivalent same-deck update", async () => {
		const store = createStore("deck-a")
		const service = screenshotState.instances[0]
		const slide = createSlide("slide-a", "<div>A</div>")
		store.pathMappingService.setPathFileIdMapping(slide.path, "file-a")
		store.setSlides([slide], true)

		await store.updateConfig({
			displayConfig: { slides: [slide.path] },
			attachmentList: [],
		})

		expect(service.reset).not.toHaveBeenCalled()
		expect(service.dispose).not.toHaveBeenCalled()
	})
})
