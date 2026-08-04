import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { SlideScreenshotService } from "../SlideScreenshotService"
import { snapdom } from "@zumer/snapdom"

vi.mock("../../../../contents/HTML/utils/full-content", () => ({
	decodeHTMLEntities: (content: string) => content,
	fallbackImageBase64: "data:image/png;base64,",
	getFullContent: (content: string) => content,
}))

const snapdomMocks = vi.hoisted(() => {
	let counter = 0

	return {
		toWebp: vi.fn(async () => {
			counter += 1
			return { src: `blob:mock-url-${counter}` }
		}),
		resetCounter: () => {
			counter = 0
		},
	}
})

// Mock snapdom
vi.mock("@zumer/snapdom", () => ({
	snapdom: vi.fn().mockResolvedValue({
		toWebp: snapdomMocks.toWebp,
	}),
}))

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => "blob:mock-url-" + Math.random())
global.URL.revokeObjectURL = vi.fn()

describe("SlideScreenshotService", () => {
	let service: SlideScreenshotService

	beforeEach(() => {
		service = new SlideScreenshotService()
		snapdomMocks.resetCounter()
		vi.clearAllMocks()
	})

	afterEach(() => {
		service.dispose()
	})

	describe("generateScreenshot", () => {
		it("should generate screenshot for HTML content", async () => {
			const url = "https://example.com/slide1.html"
			const content = "<html><body>Test Content</body></html>"

			const thumbnailUrl = await service.generateScreenshot(url, content)

			expect(thumbnailUrl).toMatch(/^blob:mock-url-/)
			expect(snapdomMocks.toWebp).toHaveBeenCalledWith({
				width: 1920 / 4,
				height: 1080 / 4,
				quality: 0.8,
			})
		})

		it("captures the slide container with embedded fonts for visual parity", async () => {
			const url = "https://example.com/philosophy.html"
			const content = `
				<html>
					<body>
						<div class="slide-container">
							<h1 class="page-title">EVOLUTION PHILOSOPHY</h1>
						</div>
					</body>
				</html>
			`

			await service.generateScreenshot(url, content)

			expect(snapdom).toHaveBeenCalledTimes(1)
			const [target, options] = vi.mocked(snapdom).mock.calls[0]
			expect((target as HTMLElement).classList.contains("slide-container")).toBe(true)
			expect(options).toMatchObject({
				width: 1920,
				height: 1080,
				backgroundColor: "#ffffff",
				embedFonts: true,
			})
		})

		it("uses the slide container dimensions for portrait thumbnails", async () => {
			const content = `
				<div class="slide-container" data-width="1080" data-height="1920">
					<h1>Portrait slide</h1>
				</div>
			`

			await service.generateScreenshot("https://example.com/portrait.html", content)

			const [, options] = vi.mocked(snapdom).mock.calls[0]
			expect(options).toMatchObject({ width: 1080, height: 1920 })
			expect(snapdomMocks.toWebp).toHaveBeenCalledWith({
				width: 1080 / 4,
				height: 1920 / 4,
				quality: 0.8,
			})
		})

		it("should throw error for empty content", async () => {
			await expect(service.generateScreenshot("url", "")).rejects.toThrow(
				"Content is required",
			)
		})

		it("yields before parsing dimensions and hashing the full content", async () => {
			let resumePreparation: () => void = () => undefined
			const yieldForPreparation = vi.fn(
				() =>
					new Promise<void>((resolve) => {
						resumePreparation = resolve
					}),
			)
			const hashContent = vi.fn(() => "prepared-hash")
			const parseSpy = vi.spyOn(DOMParser.prototype, "parseFromString")
			Object.assign(service, {
				yieldForPreparation,
				hashContent,
				doGenerateScreenshot: vi.fn(async () => "blob:prepared"),
			})

			const generation = service.generateScreenshot(
				"https://example.com/prepared.html",
				"<div>Prepared content</div>",
			)

			expect(yieldForPreparation).toHaveBeenCalledTimes(1)
			expect(parseSpy).not.toHaveBeenCalled()
			expect(hashContent).not.toHaveBeenCalled()

			resumePreparation()
			await expect(generation).resolves.toBe("blob:prepared")

			expect(parseSpy).toHaveBeenCalled()
			expect(hashContent).toHaveBeenCalledTimes(1)
			parseSpy.mockRestore()
		})

		it("cancels a preview while it is still waiting for preparation", async () => {
			let resumePreparation: () => void = () => undefined
			const generate = vi.fn(async () => "blob:should-not-start")
			Object.assign(service, {
				yieldForPreparation: () =>
					new Promise<void>((resolve) => {
						resumePreparation = resolve
					}),
				doGenerateScreenshot: generate,
			})

			const generation = service.generateScreenshot(
				"preview-before-preparation",
				"<div>preview</div>",
				"preview",
			)
			const rejection = expect(generation).rejects.toMatchObject({ name: "AbortError" })

			service.cancelPreviewGenerations()
			resumePreparation()

			await rejection
			expect(generate).not.toHaveBeenCalled()
		})

		it("cancels queued and active previews but protects a required consumer", async () => {
			const signals = new Map<string, AbortSignal>()
			const resolvers = new Map<string, (thumbnailUrl: string) => void>()
			const generate = vi.fn(
				(content: string, _dimensions: unknown, signal: AbortSignal) =>
					new Promise<string>((resolve) => {
						signals.set(content, signal)
						resolvers.set(content, resolve)
					}),
			)
			Object.assign(service, {
				yieldForPreparation: () => Promise.resolve(),
				doGenerateScreenshot: generate,
			})

			const protectedPreview = service.generateScreenshot("protected", "protected", "preview")
			const activePreview = service.generateScreenshot("active", "active", "preview")
			const queuedPreview = service.generateScreenshot("queued", "queued", "preview")
			await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2))

			const required = service.generateScreenshot("protected", "protected", "required")
			await Promise.resolve()
			const activeRejection = expect(activePreview).rejects.toMatchObject({
				name: "AbortError",
			})
			const queuedRejection = expect(queuedPreview).rejects.toMatchObject({
				name: "AbortError",
			})

			service.cancelPreviewGenerations()

			expect(signals.get("protected")?.aborted).toBe(false)
			expect(signals.get("active")?.aborted).toBe(true)
			await Promise.all([activeRejection, queuedRejection])
			expect(generate).not.toHaveBeenCalledWith(
				"queued",
				expect.anything(),
				expect.anything(),
			)

			resolvers.get("protected")?.("blob:protected")
			await expect(Promise.all([protectedPreview, required])).resolves.toEqual([
				"blob:protected",
				"blob:protected",
			])
			expect(generate).toHaveBeenCalledTimes(2)

			resolvers.get("active")?.("blob:late-preview")
			await vi.waitFor(() => {
				expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:late-preview")
			})
		})

		it("keeps cached thumbnails when preview generations are cancelled", async () => {
			Object.assign(service, {
				yieldForPreparation: () => Promise.resolve(),
				doGenerateScreenshot: vi.fn(async () => "blob:cached-preview"),
			})
			await service.generateScreenshot("cached-preview", "<div>cached</div>")
			vi.mocked(global.URL.revokeObjectURL).mockClear()

			service.cancelPreviewGenerations()

			expect(service.getCachedScreenshot("cached-preview")).toBe("blob:cached-preview")
			expect(global.URL.revokeObjectURL).not.toHaveBeenCalled()
		})

		it("should cache generated screenshots", async () => {
			const url = "https://example.com/slide1.html"
			const content = "<html><body>Test Content</body></html>"

			// First generation
			const url1 = await service.generateScreenshot(url, content)

			// Second call should return cached result
			const url2 = await service.generateScreenshot(url, content)

			expect(url1).toBe(url2)
			expect(service.hasCachedScreenshot(url)).toBe(true)
		})

		it("should regenerate screenshot when content changes", async () => {
			const url = "https://example.com/slide1.html"
			const content1 = "<html><body>Content 1</body></html>"
			const content2 = "<html><body>Content 2</body></html>"

			const url1 = await service.generateScreenshot(url, content1)
			const url2 = await service.generateScreenshot(url, content2)

			// Should generate new screenshot for different content
			expect(url1).not.toBe(url2)
		})

		it("does not reuse a cached screenshot when different content has the same hash", async () => {
			const firstContent = "<div>Aa</div>"
			const secondContent = "<div>BB</div>"
			const getContentHash = (
				service as unknown as { getContentHash: (content: string) => string }
			).getContentHash.bind(service)
			expect(getContentHash(firstContent)).toBe(getContentHash(secondContent))

			let generationCount = 0
			const generate = vi.fn(async () => {
				generationCount += 1
				return `blob:collision-${generationCount}`
			})
			Object.assign(service, {
				yieldForPreparation: () => Promise.resolve(),
				doGenerateScreenshot: generate,
			})

			const firstThumbnail = await service.generateScreenshot("collision-slide", firstContent)
			const secondThumbnail = await service.generateScreenshot(
				"collision-slide",
				secondContent,
			)

			expect(firstThumbnail).toBe("blob:collision-1")
			expect(secondThumbnail).toBe("blob:collision-2")
			expect(generate).toHaveBeenCalledTimes(2)
			expect(service.hasCachedScreenshot("collision-slide", firstContent)).toBe(false)
			expect(service.hasCachedScreenshot("collision-slide", secondContent)).toBe(true)
		})

		it("should handle concurrent requests for same URL", async () => {
			const url = "https://example.com/slide1.html"
			const content = "<html><body>Test Content</body></html>"

			// Start multiple concurrent requests
			const promises = [
				service.generateScreenshot(url, content),
				service.generateScreenshot(url, content),
				service.generateScreenshot(url, content),
			]

			const results = await Promise.all(promises)

			// All should return the same URL
			expect(results[0]).toBe(results[1])
			expect(results[1]).toBe(results[2])
			expect(snapdom).toHaveBeenCalledTimes(1)
		})

		it("deduplicates identical content when preparation completes out of order", async () => {
			const preparationReleases: Array<() => void> = []
			const generate = vi.fn(async () => "blob:shared")
			Object.assign(service, {
				yieldForPreparation: () =>
					new Promise<void>((resolve) => preparationReleases.push(resolve)),
				doGenerateScreenshot: generate,
			})
			const url = "https://example.com/shared.html"
			const content = "<div>Shared content</div>"

			const firstGeneration = service.generateScreenshot(url, content)
			const secondGeneration = service.generateScreenshot(url, content)
			expect(preparationReleases).toHaveLength(2)

			preparationReleases[1]()
			await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
			preparationReleases[0]()

			await expect(Promise.all([firstGeneration, secondGeneration])).resolves.toEqual([
				"blob:shared",
				"blob:shared",
			])
			expect(generate).toHaveBeenCalledTimes(1)
			expect(service.getCachedScreenshot(url)).toBe("blob:shared")
		})

		it("keeps concurrent revisions of the same URL separate", async () => {
			const url = "https://example.com/slide1.html"
			const oldContent = "<div>Old content</div>"
			const newContent = "<div>New content</div>"
			const preparationReleases: Array<() => void> = []
			const resolvers = new Map<string, (thumbnailUrl: string) => void>()
			const generate = vi.fn(
				(content: string) =>
					new Promise<string>((resolve) => {
						resolvers.set(content, resolve)
					}),
			)
			Object.assign(service, {
				yieldForPreparation: () =>
					new Promise<void>((resolve) => preparationReleases.push(resolve)),
				doGenerateScreenshot: generate,
			})

			const oldGeneration = service.generateScreenshot(url, oldContent)
			const newGeneration = service.generateScreenshot(url, newContent)

			expect(preparationReleases).toHaveLength(2)
			preparationReleases[1]()
			await vi.waitFor(() =>
				expect(generate).toHaveBeenCalledWith(
					newContent,
					expect.anything(),
					expect.anything(),
				),
			)
			preparationReleases[0]()
			await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2))
			resolvers.get(newContent)?.("blob:new")
			await expect(newGeneration).resolves.toBe("blob:new")
			resolvers.get(oldContent)?.("blob:old")
			await expect(oldGeneration).resolves.toBe("blob:old")

			expect(service.getCachedScreenshot(url)).toBe("blob:new")
			expect(service.hasCachedScreenshot(url, newContent)).toBe(true)
			expect(service.hasCachedScreenshot(url, oldContent)).toBe(false)
		})

		it("keeps concurrent hash collisions in separate in-flight generations", async () => {
			const firstContent = "<div>Aa</div>"
			const secondContent = "<div>BB</div>"
			const getContentHash = (
				service as unknown as { getContentHash: (content: string) => string }
			).getContentHash.bind(service)
			expect(getContentHash(firstContent)).toBe(getContentHash(secondContent))

			const resolvers = new Map<string, (thumbnailUrl: string) => void>()
			const generate = vi.fn(
				(content: string) =>
					new Promise<string>((resolve) => {
						resolvers.set(content, resolve)
					}),
			)
			Object.assign(service, {
				yieldForPreparation: () => Promise.resolve(),
				doGenerateScreenshot: generate,
			})

			const firstGeneration = service.generateScreenshot("collision-slide", firstContent)
			const secondGeneration = service.generateScreenshot("collision-slide", secondContent)

			await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2))
			resolvers.get(secondContent)?.("blob:second-collision")
			await expect(secondGeneration).resolves.toBe("blob:second-collision")
			resolvers.get(firstContent)?.("blob:first-collision")
			await expect(firstGeneration).resolves.toBe("blob:first-collision")

			expect(service.getCachedScreenshot("collision-slide")).toBe("blob:second-collision")
			expect(service.hasCachedScreenshot("collision-slide", firstContent)).toBe(false)
			expect(service.hasCachedScreenshot("collision-slide", secondContent)).toBe(true)
		})

		it("limits screenshot generation to two concurrent tasks across service instances", async () => {
			const services = [service, new SlideScreenshotService(), new SlideScreenshotService()]
			const releases: Array<() => void> = []
			let activeCount = 0
			let maxActiveCount = 0

			const generate = vi.fn(
				(content: string) =>
					new Promise<string>((resolve) => {
						activeCount += 1
						maxActiveCount = Math.max(maxActiveCount, activeCount)
						releases.push(() => {
							activeCount -= 1
							resolve(`blob:${content}`)
						})
					}),
			)

			services.forEach((targetService) => {
				Object.assign(targetService, {
					yieldForPreparation: () => Promise.resolve(),
					doGenerateScreenshot: generate,
				})
			})

			const generations = services.map((targetService, index) =>
				targetService.generateScreenshot(`slide-${index}`, `<div>${index}</div>`),
			)

			await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2))
			expect(maxActiveCount).toBe(2)

			releases.shift()?.()
			await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(3))
			expect(maxActiveCount).toBe(2)

			releases.splice(0).forEach((release) => release())
			await expect(Promise.all(generations)).resolves.toEqual([
				"blob:<div>0</div>",
				"blob:<div>1</div>",
				"blob:<div>2</div>",
			])

			services.slice(1).forEach((targetService) => targetService.dispose())
		})

		it("starts the newest queued request ahead of older background work", async () => {
			const started: string[] = []
			const releases = new Map<string, () => void>()
			const generate = vi.fn(
				(content: string) =>
					new Promise<string>((resolve) => {
						started.push(content)
						releases.set(content, () => resolve(`blob:${content}`))
					}),
			)
			Object.assign(service, {
				yieldForPreparation: () => Promise.resolve(),
				doGenerateScreenshot: generate,
			})
			const release = (content: string) => {
				const complete = releases.get(content)
				expect(complete).toBeDefined()
				releases.delete(content)
				complete?.()
			}

			const blockerOne = service.generateScreenshot("blocker-1", "blocker-1")
			const blockerTwo = service.generateScreenshot("blocker-2", "blocker-2")
			await vi.waitFor(() => expect(started).toEqual(["blocker-1", "blocker-2"]))

			const backgroundOne = service.generateScreenshot("background-1", "background-1")
			const backgroundTwo = service.generateScreenshot("background-2", "background-2")
			const current = service.generateScreenshot("current", "current")
			await Promise.resolve()

			release("blocker-1")
			await vi.waitFor(() => expect(started).toHaveLength(3))
			expect(started[2]).toBe("current")

			while (started.length < 5) {
				const previousStartedCount = started.length
				Array.from(releases.keys()).forEach(release)
				await vi.waitFor(() => expect(started.length).toBeGreaterThan(previousStartedCount))
			}
			Array.from(releases.keys()).forEach(release)

			await Promise.all([blockerOne, blockerTwo, backgroundOne, backgroundTwo, current])
		})

		it("runs the oldest queued task after a bounded priority burst", async () => {
			const started: string[] = []
			const releases = new Map<string, () => void>()
			const generate = vi.fn(
				(content: string) =>
					new Promise<string>((resolve) => {
						started.push(content)
						releases.set(content, () => resolve(`blob:${content}`))
					}),
			)
			Object.assign(service, {
				yieldForPreparation: () => Promise.resolve(),
				doGenerateScreenshot: generate,
			})
			const release = (content: string) => {
				const complete = releases.get(content)
				expect(complete).toBeDefined()
				releases.delete(content)
				complete?.()
			}

			const generations = [
				service.generateScreenshot("blocker-1", "blocker-1"),
				service.generateScreenshot("blocker-2", "blocker-2"),
			]
			await vi.waitFor(() => expect(started).toEqual(["blocker-1", "blocker-2"]))

			generations.push(service.generateScreenshot("oldest", "oldest"))
			for (let index = 0; index <= 4; index += 1) {
				generations.push(service.generateScreenshot("priority-slide", `priority-${index}`))
			}
			await Promise.resolve()

			release("blocker-1")
			await vi.waitFor(() => expect(started).toHaveLength(3))
			expect(started[2]).toBe("priority-4")

			release("priority-4")
			await vi.waitFor(() => expect(started).toHaveLength(4))
			expect(started[3]).toBe("priority-3")

			release("priority-3")
			await vi.waitFor(() => expect(started).toHaveLength(5))
			expect(started[4]).toBe("priority-2")

			release("priority-2")
			await vi.waitFor(() => expect(started).toHaveLength(6))
			expect(started[5]).toBe("oldest")

			while (started.length < generations.length) {
				const previousStartedCount = started.length
				Array.from(releases.keys()).forEach(release)
				await vi.waitFor(() => expect(started.length).toBeGreaterThan(previousStartedCount))
			}
			Array.from(releases.keys()).forEach(release)
			await Promise.all(generations)
		})
	})

	describe("cache management", () => {
		it("should get cached screenshot", async () => {
			const url = "https://example.com/slide1.html"
			const content = "<html><body>Test Content</body></html>"

			const thumbnailUrl = await service.generateScreenshot(url, content)
			const cached = service.getCachedScreenshot(url)

			expect(cached).toBe(thumbnailUrl)
		})

		it("should return null for non-cached URL", () => {
			const cached = service.getCachedScreenshot("non-existent-url")
			expect(cached).toBeNull()
		})

		it("should check if screenshot is cached", async () => {
			const url = "https://example.com/slide1.html"
			const content = "<html><body>Test Content</body></html>"

			expect(service.hasCachedScreenshot(url)).toBe(false)

			await service.generateScreenshot(url, content)

			expect(service.hasCachedScreenshot(url)).toBe(true)
			expect(service.hasCachedScreenshot(url, content)).toBe(true)
		})

		it("should clear cache for specific URL", async () => {
			const url = "https://example.com/slide1.html"
			const content = "<html><body>Test Content</body></html>"

			await service.generateScreenshot(url, content)
			expect(service.hasCachedScreenshot(url)).toBe(true)

			service.clearCache(url)
			expect(service.hasCachedScreenshot(url)).toBe(false)
			expect(global.URL.revokeObjectURL).toHaveBeenCalled()
		})

		it("releases discarded blob URLs without revoking cached thumbnails", async () => {
			Object.assign(service, {
				yieldForPreparation: () => Promise.resolve(),
				doGenerateScreenshot: vi.fn(async () => "blob:cached"),
			})
			await service.generateScreenshot("cached-slide", "<div>cached</div>")
			vi.mocked(global.URL.revokeObjectURL).mockClear()

			service.releaseScreenshot("blob:cached")
			expect(global.URL.revokeObjectURL).not.toHaveBeenCalled()

			service.releaseScreenshot("blob:discarded")
			expect(global.URL.revokeObjectURL).toHaveBeenCalledOnce()
			expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:discarded")
		})

		it("should clear all cache", async () => {
			const urls = [
				"https://example.com/slide1.html",
				"https://example.com/slide2.html",
				"https://example.com/slide3.html",
			]
			const content = "<html><body>Test Content</body></html>"

			for (const url of urls) {
				await service.generateScreenshot(url, content)
			}

			expect(service.getCacheStats().size).toBe(3)

			service.clearAllCache()

			expect(service.getCacheStats().size).toBe(0)
			expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(3)
		})

		it("should clear old cache entries", async () => {
			const url1 = "https://example.com/slide1.html"
			const url2 = "https://example.com/slide2.html"
			const content = "<html><body>Test Content</body></html>"

			// Generate first screenshot
			await service.generateScreenshot(url1, content)

			// Mock timestamp to make it old
			const cache = (
				service as unknown as {
					cache: Map<string, { timestamp: number }>
				}
			).cache
			const entry1 = cache.get(url1)
			expect(entry1).toBeDefined()
			if (!entry1) throw new Error("Expected cached screenshot")
			entry1.timestamp = Date.now() - 400000 // 6.67 minutes ago

			// Generate second screenshot (recent)
			await service.generateScreenshot(url2, content)

			// Clear old cache (older than 5 minutes)
			service.clearOldCache(300000)

			expect(service.hasCachedScreenshot(url1)).toBe(false)
			expect(service.hasCachedScreenshot(url2)).toBe(true)
		})

		it("should get cache statistics", async () => {
			const urls = ["https://example.com/slide1.html", "https://example.com/slide2.html"]
			const content = "<html><body>Test Content</body></html>"

			for (const url of urls) {
				await service.generateScreenshot(url, content)
			}

			const stats = service.getCacheStats()

			expect(stats.size).toBe(2)
			expect(stats.urls).toEqual(urls)
		})
	})

	describe("dispose", () => {
		it("aborts current work on reset and remains reusable for a new deck", async () => {
			const activeSignals = new Map<string, AbortSignal>()
			const activeResolvers = new Map<string, (thumbnailUrl: string) => void>()
			const generate = vi.fn((content: string, _dimensions: unknown, signal: AbortSignal) => {
				if (content === "new-content") return Promise.resolve("blob:new-content")
				return new Promise<string>((resolve) => {
					activeSignals.set(content, signal)
					activeResolvers.set(content, resolve)
				})
			})
			Object.assign(service, {
				yieldForPreparation: () => Promise.resolve(),
				doGenerateScreenshot: generate,
			})

			const firstGeneration = service.generateScreenshot("old-1", "old-1")
			const secondGeneration = service.generateScreenshot("old-2", "old-2")
			const queuedGeneration = service.generateScreenshot("old-queued", "old-queued")
			await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2))
			const rejections = [firstGeneration, secondGeneration, queuedGeneration].map(
				(generation) => expect(generation).rejects.toMatchObject({ name: "AbortError" }),
			)
			service.reset()

			expect(activeSignals.get("old-1")?.aborted).toBe(true)
			expect(activeSignals.get("old-2")?.aborted).toBe(true)
			await Promise.all(rejections)
			expect(generate).not.toHaveBeenCalledWith(
				"old-queued",
				expect.anything(),
				expect.anything(),
			)
			expect(service.getCacheStats().size).toBe(0)

			await expect(service.generateScreenshot("new-slide", "new-content")).resolves.toBe(
				"blob:new-content",
			)

			activeResolvers.get("old-1")?.("blob:late-old-1")
			activeResolvers.get("old-2")?.("blob:late-old-2")
			await vi.waitFor(() => {
				expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:late-old-1")
				expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:late-old-2")
			})
			expect(generate).toHaveBeenCalledTimes(3)
		})

		it("should cleanup all resources on dispose", async () => {
			const url = "https://example.com/slide1.html"
			const content = "<html><body>Test Content</body></html>"

			await service.generateScreenshot(url, content)

			service.dispose()

			expect(service.getCacheStats().size).toBe(0)
			expect(global.URL.revokeObjectURL).toHaveBeenCalled()
		})

		it("is idempotent and rejects screenshot work after disposal", async () => {
			Object.assign(service, {
				yieldForPreparation: () => Promise.resolve(),
				doGenerateScreenshot: vi.fn(async () => "blob:before-dispose"),
			})

			await service.generateScreenshot("before-dispose", "before-dispose")
			service.dispose()
			service.dispose()

			expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(1)
			await expect(
				service.generateScreenshot("after-dispose", "after-dispose"),
			).rejects.toMatchObject({ name: "AbortError" })
		})

		it("releases an exported thumbnail when dispose interrupts the cleanup delay", async () => {
			const waitForCleanupDelay = vi.fn(
				(_delayMs: number, signal: AbortSignal) =>
					new Promise<void>((_resolve, reject) => {
						const handleAbort = () => {
							signal.removeEventListener("abort", handleAbort)
							reject(signal.reason)
						}
						signal.addEventListener("abort", handleAbort, { once: true })
					}),
			)
			snapdomMocks.toWebp.mockResolvedValueOnce({
				src: "blob:exported-before-cleanup",
			})
			Object.assign(service, {
				yieldForPreparation: () => Promise.resolve(),
				setupScreenshotIframe: vi.fn(async () => undefined),
				waitForRenderingReady: vi.fn(async () => undefined),
				waitForAbortableDelay: waitForCleanupDelay,
			})

			const generation = service.generateScreenshot(
				"dispose-during-cleanup",
				"<div>dispose during cleanup</div>",
			)
			await vi.waitFor(() => {
				expect(waitForCleanupDelay).toHaveBeenCalledWith(100, expect.anything())
			})
			const rejection = expect(generation).rejects.toMatchObject({ name: "AbortError" })

			service.dispose()

			await rejection
			await vi.waitFor(() => {
				expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(
					"blob:exported-before-cleanup",
				)
			})
			expect(service.getCacheStats().size).toBe(0)
		})

		it("aborts active generations immediately, frees scheduler slots, and releases late results", async () => {
			const queuedService = new SlideScreenshotService()
			const activeResolvers = new Map<string, (thumbnailUrl: string) => void>()
			const activeSignals = new Map<string, AbortSignal>()
			const generateActive = vi.fn(
				(content: string, _dimensions: unknown, signal: AbortSignal) =>
					new Promise<string>((resolve) => {
						activeResolvers.set(content, resolve)
						activeSignals.set(content, signal)
					}),
			)
			const generateQueued = vi.fn(async () => "blob:queued-after-dispose")
			Object.assign(service, {
				yieldForPreparation: () => Promise.resolve(),
				doGenerateScreenshot: generateActive,
			})
			Object.assign(queuedService, {
				yieldForPreparation: () => Promise.resolve(),
				doGenerateScreenshot: generateQueued,
			})

			const firstGeneration = service.generateScreenshot("dispose-1", "dispose-1")
			const secondGeneration = service.generateScreenshot("dispose-2", "dispose-2")
			const queuedGeneration = queuedService.generateScreenshot(
				"queued-after-dispose",
				"queued-after-dispose",
			)
			await vi.waitFor(() => expect(generateActive).toHaveBeenCalledTimes(2))
			expect(generateQueued).not.toHaveBeenCalled()

			const firstRejection = expect(firstGeneration).rejects.toMatchObject({
				name: "AbortError",
			})
			const secondRejection = expect(secondGeneration).rejects.toMatchObject({
				name: "AbortError",
			})
			const queuedResult = expect(queuedGeneration).resolves.toBe("blob:queued-after-dispose")
			service.dispose()

			expect(activeSignals.get("dispose-1")?.aborted).toBe(true)
			expect(activeSignals.get("dispose-2")?.aborted).toBe(true)
			await Promise.all([firstRejection, secondRejection])
			await vi.waitFor(() => expect(generateQueued).toHaveBeenCalledTimes(1))
			await queuedResult

			// The underlying render promises deliberately ignore cancellation. Their
			// eventual blob URLs still belong to the disposed service and must be released.
			activeResolvers.get("dispose-1")?.("blob:disposed-1")
			activeResolvers.get("dispose-2")?.("blob:disposed-2")
			await vi.waitFor(() => {
				expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:disposed-1")
				expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:disposed-2")
			})

			expect(service.getCacheStats().size).toBe(0)
			queuedService.dispose()
		})

		it("cancels its queued generations before active slots are released on dispose", async () => {
			const generate = vi.fn(() => new Promise<string>(() => undefined))
			Object.assign(service, {
				yieldForPreparation: () => Promise.resolve(),
				doGenerateScreenshot: generate,
			})

			const firstGeneration = service.generateScreenshot(
				"dispose-active-1",
				"dispose-active-1",
			)
			const secondGeneration = service.generateScreenshot(
				"dispose-active-2",
				"dispose-active-2",
			)
			const queuedGeneration = service.generateScreenshot("dispose-queued", "dispose-queued")
			await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2))
			expect(generate).not.toHaveBeenCalledWith(
				"dispose-queued",
				expect.anything(),
				expect.anything(),
			)

			const rejections = [firstGeneration, secondGeneration, queuedGeneration].map(
				(generation) => expect(generation).rejects.toMatchObject({ name: "AbortError" }),
			)
			service.dispose()
			await Promise.all(rejections)

			expect(generate).toHaveBeenCalledTimes(2)
			expect(generate).not.toHaveBeenCalledWith(
				"dispose-queued",
				expect.anything(),
				expect.anything(),
			)
		})
	})

	describe("content hashing", () => {
		it("should detect content changes", async () => {
			const url = "https://example.com/slide1.html"
			const content1 = "<html><body>Content 1</body></html>"
			const content2 = "<html><body>Content 2</body></html>"

			await service.generateScreenshot(url, content1)

			expect(service.hasCachedScreenshot(url, content1)).toBe(true)
			expect(service.hasCachedScreenshot(url, content2)).toBe(false)
		})

		it("should recognize identical content", async () => {
			const url = "https://example.com/slide1.html"
			const content = "<html><body>Test Content</body></html>"

			await service.generateScreenshot(url, content)

			// Same content should be recognized
			expect(service.hasCachedScreenshot(url, content)).toBe(true)
		})
	})
})
