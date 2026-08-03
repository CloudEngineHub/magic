import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PPTStore } from "../PPTStore"
import type { SlideItem } from "../../PPTSidebar/types"

const mockState = vi.hoisted(() => ({
	downloadFileContent: vi.fn(),
	getTemporaryDownloadUrl: vi.fn(),
	processHtmlContent: vi.fn(),
	screenshotService: {
		generateScreenshot: vi.fn(async (key: string) => `blob:${key}`),
		releaseScreenshot: vi.fn(),
		clearCache: vi.fn(),
		getCacheStats: vi.fn(() => ({ size: 0 })),
	},
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	downloadFileContent: mockState.downloadFileContent,
	getTemporaryDownloadUrl: mockState.getTemporaryDownloadUrl,
}))

vi.mock("@/pages/superMagic/components/Detail/contents/HTML/htmlProcessor", () => ({
	processHtmlContent: mockState.processHtmlContent,
	collectFileIdsFromHtml: vi.fn(() => new Set()),
}))

vi.mock("../../../../contents/HTML/utils/full-content", () => ({
	decodeHTMLEntities: (content: string) => content,
	fallbackImageBase64: "data:image/png;base64,",
	getFullContent: (content: string) => content,
}))

vi.mock("../../services/SlideScreenshotService", () => ({
	getScreenshotService: () => mockState.screenshotService,
}))

vi.mock("@/utils/log", () => ({
	logger: {
		createLogger: () => ({
			warn: vi.fn(),
			error: vi.fn(),
		}),
	},
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({}),
	getAdminLocaleModules: () => ({}),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

function createDeck(count: number) {
	const paths = Array.from({ length: count }, (_, index) => `slide-${index}.html`)
	const attachmentList = [
		{
			file_id: "main-file",
			file_name: "index.html",
			relative_file_path: "deck/index.html",
		},
		...paths.map((path, index) => ({
			file_id: `file-${index}`,
			file_name: path,
			relative_file_path: `deck/${path}`,
		})),
	]
	return { paths, attachmentList }
}

function createStore(
	count: number,
	config: {
		contentLoadConcurrency?: number
		initialActiveIndex?: number
		autoLoadAndGenerate?: boolean
	} = {},
) {
	const deck = createDeck(count)
	const store = new PPTStore({
		attachments: [],
		attachmentList: deck.attachmentList,
		mainFileId: "main-file",
		mainFileName: "index.html",
		logger: { enabled: false },
		...config,
	})
	return { store, ...deck }
}

function setIdleSlides(store: PPTStore, count: number): SlideItem[] {
	const slides = Array.from({ length: count }, (_, index) => {
		const path = `slide-${index}.html`
		store.pathMappingService.setPathFileIdMapping(path, `file-${index}`)
		return {
			id: `slide-${index}`,
			path,
			url: `https://example.com/file-${index}.html`,
			index,
			loadingState: "idle" as const,
		}
	})
	store.setSlides(slides, true)
	return slides
}

describe("PPTStore content lazy loading", () => {
	const stores: PPTStore[] = []

	beforeEach(() => {
		vi.clearAllMocks()
		mockState.getTemporaryDownloadUrl.mockImplementation(async ({ file_ids }) =>
			file_ids.map((fileId: string) => ({
				file_id: fileId,
				url: `https://example.com/${fileId}.html`,
			})),
		)
		mockState.downloadFileContent.mockImplementation(
			async (url: string) => `<main>${url}</main>`,
		)
		mockState.processHtmlContent.mockImplementation(async ({ content }) => ({
			processedContent: content,
		}))
	})

	afterEach(() => {
		stores.splice(0).forEach((store) => store.dispose())
	})

	it("opens a 200-page deck without downloading every slide HTML file", async () => {
		const { store, paths } = createStore(200)
		stores.push(store)

		await store.initializeSlides(paths)

		expect(mockState.downloadFileContent).toHaveBeenCalledTimes(1)
		expect(store.slides[0]?.loadingState).toBe("loaded")
		expect(store.slides[1]?.loadingState).toBe("idle")
		expect(store.slides[199]?.loadingState).toBe("idle")
		expect(store.isInitializing).toBe(false)
		expect(store.loadingProgress).toBe(100)
	})

	it("loads only the active page until the sidebar reports its virtual window", async () => {
		const { store } = createStore(5)
		stores.push(store)
		setIdleSlides(store, 5)

		store.setActiveIndex(2)

		await vi.waitFor(() => expect(store.slides[2]?.loadingState).toBe("loaded"))
		expect(mockState.downloadFileContent.mock.calls.map(([url]) => url)).toEqual([
			"https://example.com/file-2.html",
		])
		expect(store.slides[1]?.loadingState).toBe("idle")
		expect(store.slides[3]?.loadingState).toBe("idle")
	})

	it("keeps direct navigation demand-driven when automatic preview generation is disabled", async () => {
		const { store } = createStore(2, { autoLoadAndGenerate: false })
		stores.push(store)
		setIdleSlides(store, 2)

		store.setActiveIndex(1)

		await vi.waitFor(() => expect(store.slides[1]?.loadingState).toBe("loaded"))
		expect(mockState.downloadFileContent).toHaveBeenCalledTimes(1)
		expect(mockState.screenshotService.generateScreenshot).not.toHaveBeenCalled()
	})

	it("cancels stale active loads so the latest navigation starts immediately", async () => {
		const { store } = createStore(3, { contentLoadConcurrency: 1 })
		stores.push(store)
		setIdleSlides(store, 3)
		const requestSignals = new Map<string, AbortSignal | undefined>()
		mockState.downloadFileContent.mockImplementation(
			(url: string, options: { signal?: AbortSignal }) => {
				requestSignals.set(url, options.signal)
				if (url.endsWith("file-2.html")) return Promise.resolve("<main>latest</main>")
				return new Promise<string>((_resolve, reject) => {
					options.signal?.addEventListener("abort", () => {
						reject(new DOMException("The operation was aborted", "AbortError"))
					})
				})
			},
		)

		store.setActiveIndex(0)
		await vi.waitFor(() => expect(requestSignals.size).toBe(1))
		store.setActiveIndex(1)
		await vi.waitFor(() => expect(requestSignals.size).toBe(2))
		store.setActiveIndex(2)

		await vi.waitFor(() => expect(store.slides[2]?.loadingState).toBe("loaded"))
		expect(requestSignals.get("https://example.com/file-0.html")?.aborted).toBe(true)
		expect(requestSignals.get("https://example.com/file-1.html")?.aborted).toBe(true)
		expect(store.slides[0]?.loadingState).toBe("idle")
		expect(store.slides[1]?.loadingState).toBe("idle")
	})

	it("skips thumbnail generation when a running preview leaves the sidebar window", async () => {
		const { store } = createStore(2)
		stores.push(store)
		setIdleSlides(store, 2)
		let resolveFirstDownload: (content: string) => void = () => undefined
		mockState.downloadFileContent.mockImplementation((url: string) => {
			if (url.endsWith("file-0.html")) {
				return new Promise<string>((resolve) => {
					resolveFirstDownload = resolve
				})
			}
			return Promise.resolve("<main>visible</main>")
		})

		store.updateVisibleSlidePreviews([0])
		await vi.waitFor(() => expect(mockState.downloadFileContent).toHaveBeenCalledTimes(1))
		store.updateVisibleSlidePreviews([1])
		resolveFirstDownload("<main>stale preview</main>")

		await vi.waitFor(() => expect(store.slides[1]?.thumbnailUrl).toBeDefined())
		expect(store.slides[0]?.loadingState).toBe("loaded")
		expect(store.slides[0]?.thumbnailUrl).toBeUndefined()
	})

	it("finishes initialization when a same-deck config update supersedes the active-page load", async () => {
		const { store, paths, attachmentList } = createStore(200)
		stores.push(store)
		let resolveActiveDownload: (content: string) => void = () => undefined
		mockState.downloadFileContent.mockImplementationOnce(
			() =>
				new Promise<string>((resolve) => {
					resolveActiveDownload = resolve
				}),
		)

		const initialUpdate = store.updateConfig({
			displayConfig: { slides: paths },
			attachmentList,
		})
		await vi.waitFor(() => expect(store.slides).toHaveLength(200))
		await vi.waitFor(() => expect(mockState.downloadFileContent).toHaveBeenCalledTimes(1))

		// A refreshed config object with the same slide paths must adopt the pending initialization.
		const latestUpdate = store.updateConfig({
			displayConfig: { slides: [...paths] },
			attachmentList,
		})

		resolveActiveDownload("<main>active slide</main>")
		await Promise.all([initialUpdate, latestUpdate])

		expect(store.slides[store.activeIndex]?.loadingState).toBe("loaded")
		expect(store.isInitializing).toBe(false)
		expect(store.loadingProgress).toBe(100)
	})

	it("waits for the replacement active-page load after a non-active attachment update", async () => {
		const { store, paths, attachmentList } = createStore(2)
		stores.push(store)
		let initialSignal: AbortSignal | undefined
		let resolveReplacementDownload: (content: string) => void = () => undefined
		mockState.downloadFileContent
			.mockImplementationOnce(
				(_url: string, options: { signal?: AbortSignal }) =>
					new Promise<string>((_resolve, reject) => {
						initialSignal = options.signal
						options.signal?.addEventListener("abort", () => {
							reject(new DOMException("The operation was aborted", "AbortError"))
						})
					}),
			)
			.mockImplementationOnce(
				() =>
					new Promise<string>((resolve) => {
						resolveReplacementDownload = resolve
					}),
			)

		const initialUpdate = store.updateConfig({
			displayConfig: { slides: paths },
			attachmentList,
		})
		await vi.waitFor(() => expect(initialSignal).toBeDefined())

		const latestUpdate = store.updateConfig({
			displayConfig: { slides: [...paths] },
			attachmentList: attachmentList.map((item) =>
				item.file_id === "file-1" ? { ...item, updated_at: "2026-08-03T00:00:00Z" } : item,
			),
		})

		await vi.waitFor(() => expect(initialSignal?.aborted).toBe(true))
		await vi.waitFor(() =>
			expect(mockState.downloadFileContent.mock.calls.length).toBeGreaterThan(1),
		)
		expect(store.isInitializing).toBe(true)

		resolveReplacementDownload("<main>replacement active slide</main>")
		await Promise.all([initialUpdate, latestUpdate])

		expect(store.slides[store.activeIndex]?.loadingState).toBe("loaded")
		expect(store.isInitializing).toBe(false)
		expect(store.loadingProgress).toBe(100)
	})

	it("does not let a stale config update close a newer deck initialization", async () => {
		const { store, paths, attachmentList } = createStore(1)
		stores.push(store)
		let staleSignal: AbortSignal | undefined
		let resolveNewDeckDownload: (content: string) => void = () => undefined
		mockState.downloadFileContent
			.mockImplementationOnce(
				(_url: string, options: { signal?: AbortSignal }) =>
					new Promise<string>((_resolve, reject) => {
						staleSignal = options.signal
						options.signal?.addEventListener("abort", () => {
							reject(new DOMException("The operation was aborted", "AbortError"))
						})
					}),
			)
			.mockImplementationOnce(
				() =>
					new Promise<string>((resolve) => {
						resolveNewDeckDownload = resolve
					}),
			)

		const staleUpdate = store.updateConfig({
			displayConfig: { slides: paths },
			attachmentList,
		})
		await vi.waitFor(() => expect(staleSignal).toBeDefined())

		const latestUpdate = store.updateConfig({
			mainFileId: "new-main-file",
			mainFileName: "index.html",
			displayConfig: { slides: ["new-slide.html"] },
			attachmentList: [
				{
					file_id: "new-main-file",
					file_name: "index.html",
					relative_file_path: "new-deck/index.html",
				},
				{
					file_id: "new-slide-file",
					file_name: "new-slide.html",
					relative_file_path: "new-deck/new-slide.html",
				},
			],
		})

		await vi.waitFor(() => expect(staleSignal?.aborted).toBe(true))
		await vi.waitFor(() =>
			expect(mockState.downloadFileContent.mock.calls.length).toBeGreaterThan(1),
		)
		expect(store.isInitializing).toBe(true)

		resolveNewDeckDownload("<main>new deck active slide</main>")
		await Promise.all([staleUpdate, latestUpdate])

		expect(store.slides.map((slide) => slide.path)).toEqual(["new-slide.html"])
		expect(store.slides[0]?.loadingState).toBe("loaded")
		expect(store.isInitializing).toBe(false)
		expect(store.loadingProgress).toBe(100)
	})

	it("loads the configured initial page before page zero", async () => {
		const { store, paths } = createStore(200, { initialActiveIndex: 100 })
		stores.push(store)

		await store.initializeSlides(paths)

		expect(store.activeIndex).toBe(100)
		expect(mockState.downloadFileContent).toHaveBeenNthCalledWith(
			1,
			"https://example.com/file-100.html",
			{ signal: expect.any(AbortSignal) },
		)
	})

	it("keeps initialization pending until the latest restored active page settles", async () => {
		const { store, paths } = createStore(3)
		stores.push(store)
		let initialSignal: AbortSignal | undefined
		let resolveLatestDownload: (content: string) => void = () => undefined
		mockState.downloadFileContent
			.mockImplementationOnce(
				(_url: string, options: { signal?: AbortSignal }) =>
					new Promise<string>((_resolve, reject) => {
						initialSignal = options.signal
						options.signal?.addEventListener("abort", () => {
							reject(new DOMException("The operation was aborted", "AbortError"))
						})
					}),
			)
			.mockImplementationOnce(
				() =>
					new Promise<string>((resolve) => {
						resolveLatestDownload = resolve
					}),
			)

		const initialization = store.initializeSlides(paths)
		await vi.waitFor(() => expect(initialSignal).toBeDefined())

		store.setActiveIndex(2)

		await vi.waitFor(() => expect(initialSignal?.aborted).toBe(true))
		await vi.waitFor(() => expect(mockState.downloadFileContent).toHaveBeenCalledTimes(2))
		expect(store.isInitializing).toBe(true)

		resolveLatestDownload("<main>restored active slide</main>")
		await initialization

		expect(store.activeIndex).toBe(2)
		expect(store.slides[2]?.loadingState).toBe("loaded")
		expect(store.isInitializing).toBe(false)
	})

	it("keeps sidebar content work within the configured concurrency limit", async () => {
		const { store } = createStore(12, { contentLoadConcurrency: 4 })
		stores.push(store)
		setIdleSlides(store, 12)
		let activeRequests = 0
		let maximumActiveRequests = 0
		mockState.downloadFileContent.mockImplementation(async (url: string) => {
			activeRequests++
			maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
			await new Promise((resolve) => window.setTimeout(resolve, 5))
			activeRequests--
			return `<main>${url}</main>`
		})

		store.updateVisibleSlidePreviews(Array.from({ length: 12 }, (_, index) => index))

		await vi.waitFor(
			() => expect(store.slides.every((slide) => slide.loadingState === "loaded")).toBe(true),
			{ timeout: 2000 },
		)
		expect(maximumActiveRequests).toBeGreaterThan(1)
		expect(maximumActiveRequests).toBeLessThanOrEqual(4)
	})

	it("deduplicates active and sidebar demand for the same slide", async () => {
		const { store } = createStore(1)
		stores.push(store)
		setIdleSlides(store, 1)
		let resolveDownload: (content: string) => void = () => undefined
		mockState.downloadFileContent.mockImplementation(
			() =>
				new Promise<string>((resolve) => {
					resolveDownload = resolve
				}),
		)

		const activePromise = store.ensureSlideContent(0, "active")
		store.updateVisibleSlidePreviews([0])
		await vi.waitFor(() => expect(mockState.downloadFileContent).toHaveBeenCalledTimes(1))

		resolveDownload("<main>slide 0</main>")
		await expect(activePromise).resolves.toBe(true)
		await vi.waitFor(() => expect(store.slides[0]?.loadingState).toBe("loaded"))
		expect(mockState.downloadFileContent).toHaveBeenCalledTimes(1)
	})

	it("loads targets reached through direct, next, previous and first-page navigation", async () => {
		const { store } = createStore(3)
		stores.push(store)
		setIdleSlides(store, 3)

		store.setActiveIndex(1)
		await vi.waitFor(() => expect(store.slides[1]?.loadingState).toBe("loaded"))
		store.nextSlide()
		await vi.waitFor(() => expect(store.slides[2]?.loadingState).toBe("loaded"))
		store.prevSlide()
		expect(store.activeIndex).toBe(1)
		store.goToFirstSlide()
		await vi.waitFor(() => expect(store.slides[0]?.loadingState).toBe("loaded"))

		expect(new Set(mockState.downloadFileContent.mock.calls.map(([url]) => url))).toEqual(
			new Set([
				"https://example.com/file-1.html",
				"https://example.com/file-2.html",
				"https://example.com/file-0.html",
			]),
		)
		expect(mockState.downloadFileContent).toHaveBeenCalledTimes(3)
	})

	it("drops queued previews that leave the virtual range during fast scrolling", async () => {
		const { store } = createStore(6, { contentLoadConcurrency: 2 })
		stores.push(store)
		setIdleSlides(store, 6)
		let resolveFirst: (content: string) => void = () => undefined
		mockState.downloadFileContent.mockImplementation((url: string) => {
			if (url.endsWith("file-0.html")) {
				return new Promise<string>((resolve) => {
					resolveFirst = resolve
				})
			}
			return Promise.resolve(`<main>${url}</main>`)
		})

		store.updateVisibleSlidePreviews([0, 1, 2, 3, 4, 5])
		await vi.waitFor(() => expect(mockState.downloadFileContent).toHaveBeenCalledTimes(1))
		store.updateVisibleSlidePreviews([5])
		resolveFirst("<main>slide 0</main>")

		await vi.waitFor(() => expect(store.slides[5]?.loadingState).toBe("loaded"))
		expect(mockState.downloadFileContent.mock.calls.map(([url]) => url)).toEqual([
			"https://example.com/file-0.html",
			"https://example.com/file-5.html",
		])
	})

	it("aborts old deck work on reset and prevents late content writes", async () => {
		const { store } = createStore(1)
		stores.push(store)
		setIdleSlides(store, 1)
		let requestSignal: AbortSignal | undefined
		mockState.downloadFileContent.mockImplementation(
			(_url: string, options: { signal?: AbortSignal }) =>
				new Promise<string>((_resolve, reject) => {
					requestSignal = options.signal
					options.signal?.addEventListener("abort", () => {
						reject(new DOMException("The operation was aborted", "AbortError"))
					})
				}),
		)

		const loadPromise = store.ensureSlideContent(0, "active")
		await vi.waitFor(() => expect(requestSignal).toBeDefined())
		store.reset()

		expect(requestSignal?.aborted).toBe(true)
		await expect(loadPromise).resolves.toBe(false)
		expect(store.slides).toEqual([])
	})

	it("can initialize the same deck again after reset invalidates an in-flight initialization", async () => {
		const { store, paths } = createStore(2)
		stores.push(store)
		let firstFileIds: string[] = []
		let resolveFirstUrls: (value: Array<{ file_id: string; url: string }>) => void = () =>
			undefined
		mockState.getTemporaryDownloadUrl
			.mockImplementationOnce(
				({ file_ids }: { file_ids: string[] }) =>
					new Promise<Array<{ file_id: string; url: string }>>((resolve) => {
						firstFileIds = file_ids
						resolveFirstUrls = resolve
					}),
			)
			.mockImplementation(async ({ file_ids }: { file_ids: string[] }) =>
				file_ids.map((fileId) => ({
					file_id: fileId,
					url: `https://example.com/${fileId}.html`,
				})),
			)

		const staleInitialization = store.initializeSlides(paths)
		await vi.waitFor(() => expect(mockState.getTemporaryDownloadUrl).toHaveBeenCalledTimes(1))
		store.reset()

		await store.initializeSlides(paths)
		resolveFirstUrls(
			firstFileIds.map((fileId) => ({
				file_id: fileId,
				url: `https://stale.example.com/${fileId}.html`,
			})),
		)
		await staleInitialization

		expect(mockState.getTemporaryDownloadUrl).toHaveBeenCalledTimes(2)
		expect(store.slides.map((slide) => slide.path)).toEqual(paths)
		expect(store.slides[0]?.loadingState).toBe("loaded")
	})

	it("keeps a newer deck when an older incremental addition resolves late", async () => {
		const { store, attachmentList } = createStore(1)
		stores.push(store)
		setIdleSlides(store, 1)
		let resolveOldUrls: (value: Array<{ file_id: string; url: string }>) => void = () =>
			undefined
		mockState.getTemporaryDownloadUrl
			.mockImplementationOnce(
				() =>
					new Promise<Array<{ file_id: string; url: string }>>((resolve) => {
						resolveOldUrls = resolve
					}),
			)
			.mockImplementation(async ({ file_ids }: { file_ids: string[] }) =>
				file_ids.map((fileId) => ({
					file_id: fileId,
					url: `https://example.com/${fileId}.html`,
				})),
			)

		const staleUpdate = store.updateConfig({
			displayConfig: { slides: ["slide-0.html", "slide-1.html"] },
			attachmentList: [
				...attachmentList,
				{
					file_id: "file-1",
					file_name: "slide-1.html",
					relative_file_path: "deck/slide-1.html",
				},
			],
		})
		await vi.waitFor(() => expect(mockState.getTemporaryDownloadUrl).toHaveBeenCalledTimes(1))

		await store.updateConfig({
			mainFileId: "new-main-file",
			mainFileName: "index.html",
			displayConfig: { slides: ["new-slide.html"] },
			attachmentList: [
				{
					file_id: "new-main-file",
					file_name: "index.html",
					relative_file_path: "new-deck/index.html",
				},
				{
					file_id: "new-slide-file",
					file_name: "new-slide.html",
					relative_file_path: "new-deck/new-slide.html",
				},
			],
		})
		resolveOldUrls([
			{
				file_id: "file-1",
				url: "https://stale.example.com/file-1.html",
			},
		])
		await staleUpdate

		expect(store.slides.map((slide) => slide.path)).toEqual(["new-slide.html"])
		expect(store.slides[0]?.content).toContain("new-slide-file")
	})

	it("reconciles every page from the latest same-deck config update", async () => {
		const { store, attachmentList } = createStore(1)
		stores.push(store)
		setIdleSlides(store, 1)
		let resolveFirstUrls: (value: Array<{ file_id: string; url: string }>) => void = () =>
			undefined
		mockState.getTemporaryDownloadUrl
			.mockImplementationOnce(
				() =>
					new Promise<Array<{ file_id: string; url: string }>>((resolve) => {
						resolveFirstUrls = resolve
					}),
			)
			.mockImplementation(async ({ file_ids }: { file_ids: string[] }) =>
				file_ids.map((fileId) => ({
					file_id: fileId,
					url: `https://example.com/${fileId}.html`,
				})),
			)

		const firstUpdate = store.updateConfig({
			displayConfig: { slides: ["slide-0.html", "slide-1.html"] },
			attachmentList: [
				...attachmentList,
				{
					file_id: "file-1",
					file_name: "slide-1.html",
					relative_file_path: "deck/slide-1.html",
				},
			],
		})
		await vi.waitFor(() => expect(mockState.getTemporaryDownloadUrl).toHaveBeenCalledTimes(1))

		await store.updateConfig({
			displayConfig: {
				slides: ["slide-0.html", "slide-1.html", "slide-2.html"],
			},
			attachmentList: [
				...attachmentList,
				{
					file_id: "file-1",
					file_name: "slide-1.html",
					relative_file_path: "deck/slide-1.html",
				},
				{
					file_id: "file-2",
					file_name: "slide-2.html",
					relative_file_path: "deck/slide-2.html",
				},
			],
		})
		resolveFirstUrls([
			{
				file_id: "file-1",
				url: "https://stale.example.com/file-1.html",
			},
		])
		await firstUpdate

		expect(store.slides.map((slide) => slide.path)).toEqual([
			"slide-0.html",
			"slide-1.html",
			"slide-2.html",
		])
	})

	it("restarts pending initialization when the same main file gets newer attachments", async () => {
		const { store } = createStore(0)
		stores.push(store)
		let resolveOldInitialization: (
			value: Array<{ file_id: string; url: string }>,
		) => void = () => undefined
		mockState.getTemporaryDownloadUrl
			.mockImplementationOnce(
				() =>
					new Promise<Array<{ file_id: string; url: string }>>((resolve) => {
						resolveOldInitialization = resolve
					}),
			)
			.mockImplementation(async ({ file_ids }: { file_ids: string[] }) =>
				file_ids.map((fileId) => ({
					file_id: fileId,
					url: `https://example.com/${fileId}.html`,
				})),
			)

		const staleInitialization = store.updateConfig({
			mainFileId: "replacement-main",
			mainFileName: "index.html",
			displayConfig: { slides: ["shared-slide.html"] },
			attachmentList: [
				{
					file_id: "replacement-main",
					file_name: "index.html",
					relative_file_path: "replacement/index.html",
				},
				{
					file_id: "old-shared-file",
					file_name: "shared-slide.html",
					relative_file_path: "replacement/shared-slide.html",
				},
			],
		})
		await vi.waitFor(() => expect(mockState.getTemporaryDownloadUrl).toHaveBeenCalledTimes(1))

		await store.updateConfig({
			mainFileId: "replacement-main",
			mainFileName: "index.html",
			displayConfig: { slides: ["shared-slide.html"] },
			attachmentList: [
				{
					file_id: "replacement-main",
					file_name: "index.html",
					relative_file_path: "replacement/index.html",
				},
				{
					file_id: "new-shared-file",
					file_name: "shared-slide.html",
					relative_file_path: "replacement/shared-slide.html",
				},
			],
		})
		resolveOldInitialization([
			{
				file_id: "old-shared-file",
				url: "https://stale.example.com/old-shared-file.html",
			},
		])
		await staleInitialization

		expect(store.slides.map((slide) => slide.path)).toEqual(["shared-slide.html"])
		expect(store.getFileIdByPath("shared-slide.html")).toBe("new-shared-file")
		expect(store.slides[0]?.content).toContain("new-shared-file")
	})

	it("prevents an old scheduled request from overwriting a manual refresh", async () => {
		const { store } = createStore(1)
		stores.push(store)
		setIdleSlides(store, 1)
		let resolveOldDownload: (content: string) => void = () => undefined
		mockState.downloadFileContent
			.mockImplementationOnce(
				() =>
					new Promise<string>((resolve) => {
						resolveOldDownload = resolve
					}),
			)
			.mockImplementation(async () => "<main>fresh content</main>")

		const staleLoad = store.ensureSlideContent(0, "preview")
		await vi.waitFor(() => expect(mockState.downloadFileContent).toHaveBeenCalledTimes(1))
		await store.refreshSlideByFileId("file-0")

		expect(store.slides[0]?.content).toContain("fresh content")
		resolveOldDownload("<main>stale content</main>")
		await expect(staleLoad).resolves.toBe(false)
		await new Promise((resolve) => window.setTimeout(resolve, 0))
		expect(store.slides[0]?.content).toContain("fresh content")
	})

	it("aborts silent direct downloads when the store resets", async () => {
		const { store } = createStore(1)
		stores.push(store)
		setIdleSlides(store, 1)
		let requestSignal: AbortSignal | undefined
		mockState.downloadFileContent.mockImplementation(
			(_url: string, options: { signal?: AbortSignal }) =>
				new Promise<string>((_resolve, reject) => {
					requestSignal = options.signal
					options.signal?.addEventListener("abort", () => {
						reject(new DOMException("The operation was aborted", "AbortError"))
					})
				}),
		)

		const silentLoad = store.loadSlideContentSilently("https://example.com/file-0.html", 0)
		await vi.waitFor(() => expect(requestSignal).toBeDefined())
		store.reset()

		expect(requestSignal?.aborted).toBe(true)
		await expect(silentLoad).resolves.toBe("")
	})

	it("leaves initialization after an active-page error", async () => {
		const { store, paths } = createStore(1)
		stores.push(store)
		mockState.downloadFileContent.mockRejectedValue(new Error("network failed"))
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

		await store.initializeSlides(paths)

		expect(store.isInitializing).toBe(false)
		expect(store.slides[0]?.loadingState).toBe("error")
		expect(store.slides[0]?.loadingError).toBeInstanceOf(Error)
		consoleError.mockRestore()
	})
})
