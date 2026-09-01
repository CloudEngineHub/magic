import { Blob as NodeBlob } from "node:buffer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	CANVAS_MEDIA_CACHE_NAME,
	CANVAS_MEDIA_DB_NAME,
	CANVAS_MEDIA_OFFLINE_CACHE_VERSION,
	cleanupLegacyCanvasMediaStorage,
	encodeResourcePathForUrl,
	handleCanvasMediaMessage,
	handleCanvasMediaRequest,
	parseVirtualResourceRequest,
} from "../canvasMediaShared"

type StoredCanvasEntry = {
	id: string
	namespace: string
	path: string
	mediaType: "image" | "video" | "audio"
	url?: string
	cacheKey?: string
	sourceUrl?: string
	lastAccessedAt?: number
	updatedAt?: number
	size?: number
	etag?: string | null
	lastModified?: string | null
	contentLength?: number | null
	contentType?: string | null
}

const TEST_ORIGIN = "https://canvas.test"

class FakeIdbRequest<T> {
	public result!: T
	public error: Error | null = null
	public onsuccess: ((this: IDBRequest<T>, ev: Event) => unknown) | null = null
	public onerror: ((this: IDBRequest<T>, ev: Event) => unknown) | null = null
	public onupgradeneeded:
		| ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => unknown)
		| null = null

	public succeed(result: T): void {
		this.result = result
		queueMicrotask(() => {
			this.onsuccess?.call(this as unknown as IDBRequest<T>, new Event("success"))
		})
	}
}

class FakeObjectStore {
	public constructor(private readonly records: Map<string, StoredCanvasEntry>) {}

	public get(key: string): IDBRequest<StoredCanvasEntry | undefined> {
		const request = new FakeIdbRequest<StoredCanvasEntry | undefined>()
		request.succeed(this.records.get(key))
		return request as unknown as IDBRequest<StoredCanvasEntry | undefined>
	}

	public put(value: StoredCanvasEntry): IDBRequest<StoredCanvasEntry> {
		const request = new FakeIdbRequest<StoredCanvasEntry>()
		this.records.set(value.id, value)
		request.succeed(value)
		return request as unknown as IDBRequest<StoredCanvasEntry>
	}

	public getAll(): IDBRequest<StoredCanvasEntry[]> {
		const request = new FakeIdbRequest<StoredCanvasEntry[]>()
		request.succeed([...this.records.values()])
		return request as unknown as IDBRequest<StoredCanvasEntry[]>
	}

	public delete(key: string): IDBRequest<undefined> {
		const request = new FakeIdbRequest<undefined>()
		this.records.delete(key)
		request.succeed(undefined)
		return request as unknown as IDBRequest<undefined>
	}
}

class FakeTransaction {
	public oncomplete: (() => void) | null = null
	public onerror: (() => void) | null = null
	public onabort: (() => void) | null = null

	public constructor(private readonly records: Map<string, StoredCanvasEntry>) {
		queueMicrotask(() => {
			queueMicrotask(() => this.oncomplete?.())
		})
	}

	public objectStore(): FakeObjectStore {
		return new FakeObjectStore(this.records)
	}
}

class FakeDatabase {
	private readonly stores = new Map<string, Map<string, StoredCanvasEntry>>()

	public objectStoreNames = {
		contains: (name: string) => this.stores.has(name),
	}

	public createObjectStore(name: string): FakeObjectStore {
		const store = new Map<string, StoredCanvasEntry>()
		this.stores.set(name, store)
		return new FakeObjectStore(store)
	}

	public transaction(name: string): FakeTransaction {
		if (!this.stores.has(name)) {
			this.stores.set(name, new Map<string, StoredCanvasEntry>())
		}
		const store = this.stores.get(name)
		if (!store) throw new Error(`Missing object store: ${name}`)
		return new FakeTransaction(store)
	}
}

class FakeIndexedDbFactory {
	private readonly databases = new Map<string, FakeDatabase>()

	public open(name: string): IDBOpenDBRequest {
		const request = new FakeIdbRequest<IDBDatabase>() as unknown as IDBOpenDBRequest
		queueMicrotask(() => {
			let db = this.databases.get(name)
			const isNew = !db
			if (!db) {
				db = new FakeDatabase()
				this.databases.set(name, db)
			}
			;(request as unknown as FakeIdbRequest<IDBDatabase>).result =
				db as unknown as IDBDatabase
			if (isNew) {
				request.onupgradeneeded?.call(
					request,
					new Event("upgradeneeded") as IDBVersionChangeEvent,
				)
			}
			;(request as unknown as FakeIdbRequest<IDBDatabase>).onsuccess?.call(
				request as unknown as IDBRequest<IDBDatabase>,
				new Event("success"),
			)
		})
		return request
	}
}

class FakeCache {
	private readonly entries = new Map<string, Response>()

	public async match(key: string): Promise<Response | undefined> {
		const response = this.entries.get(key)
		return response?.clone()
	}

	public async put(key: string, response: Response): Promise<void> {
		this.entries.set(key, response.clone())
	}

	public async delete(key: string): Promise<boolean> {
		return this.entries.delete(key)
	}
}

class FakeCacheStorage {
	private readonly caches = new Map<string, FakeCache>()

	public async open(name: string): Promise<FakeCache> {
		if (!this.caches.has(name)) {
			this.caches.set(name, new FakeCache())
		}
		return this.caches.get(name) as FakeCache
	}
}

function buildVirtualUrl(
	path: string,
	mediaType: StoredCanvasEntry["mediaType"] = "image",
): string {
	return `${TEST_ORIGIN}/sw/canvas-design-media/workspace/project/design/demo/${mediaType}/design-resource/${encodeResourcePathForUrl(path)}`
}

async function saveCanvasEntry(
	entry: StoredCanvasEntry,
	options?: { dbName?: string; dbVersion?: number },
): Promise<void> {
	const openRequest = indexedDB.open(
		options?.dbName ?? CANVAS_MEDIA_DB_NAME,
		options?.dbVersion ?? CANVAS_MEDIA_OFFLINE_CACHE_VERSION,
	)
	const db = await new Promise<IDBDatabase>((resolve) => {
		openRequest.onsuccess = () => resolve(openRequest.result)
	})
	const store = db.transaction("resources", "readwrite").objectStore("resources")
	await new Promise<void>((resolve) => {
		const request = store.put(entry)
		request.onsuccess = () => resolve()
	})
}

async function readCanvasEntry(id: string): Promise<StoredCanvasEntry | undefined> {
	const openRequest = indexedDB.open(CANVAS_MEDIA_DB_NAME, CANVAS_MEDIA_OFFLINE_CACHE_VERSION)
	const db = await new Promise<IDBDatabase>((resolve) => {
		openRequest.onsuccess = () => resolve(openRequest.result)
	})
	const store = db.transaction("resources", "readonly").objectStore("resources")
	return new Promise<StoredCanvasEntry | undefined>((resolve) => {
		const request = store.get(id)
		request.onsuccess = () => resolve(request.result)
	})
}

describe("canvasMediaShared", () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, "indexedDB", {
			configurable: true,
			value: new FakeIndexedDbFactory(),
		})
		Object.defineProperty(globalThis, "caches", {
			configurable: true,
			value: new FakeCacheStorage(),
		})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("uses a new cache namespace when path key semantics change", () => {
		expect(CANVAS_MEDIA_OFFLINE_CACHE_VERSION).toBe(4)
		expect(CANVAS_MEDIA_DB_NAME).toBe("canvas-media-resource-offline-cache-v4")
		expect(CANVAS_MEDIA_CACHE_NAME).toBe("canvas-media-resources-v4")
	})

	it("deletes only legacy Canvas media IndexedDB and CacheStorage namespaces", async () => {
		const deletedDatabases: string[] = []
		const indexedDBFactory = {
			deleteDatabase: vi.fn((name: string) => {
				deletedDatabases.push(name)
				const request = new FakeIdbRequest<undefined>()
				request.succeed(undefined)
				return request as unknown as IDBOpenDBRequest
			}),
		} as unknown as IDBFactory
		const cacheStorage = {
			delete: vi.fn().mockResolvedValue(true),
		} as unknown as CacheStorage

		await cleanupLegacyCanvasMediaStorage({ indexedDBFactory, cacheStorage })

		expect(deletedDatabases).toEqual([
			"canvas-media-resource-offline-cache-v1",
			"canvas-media-resource-offline-cache-v2",
			"canvas-media-resource-offline-cache-v3",
		])
		expect(cacheStorage.delete).toHaveBeenCalledTimes(3)
		expect(cacheStorage.delete).toHaveBeenNthCalledWith(1, "canvas-media-resources-v1")
		expect(cacheStorage.delete).toHaveBeenNthCalledWith(2, "canvas-media-resources-v2")
		expect(cacheStorage.delete).toHaveBeenNthCalledWith(3, "canvas-media-resources-v3")
		expect(deletedDatabases).not.toContain(CANVAS_MEDIA_DB_NAME)
		expect(cacheStorage.delete).not.toHaveBeenCalledWith(CANVAS_MEDIA_CACHE_NAME)
	})

	it("does not reject cache initialization when legacy cleanup fails", async () => {
		const indexedDBFactory = {
			deleteDatabase: vi.fn(() => {
				throw new Error("deleteDatabase unavailable")
			}),
		} as unknown as IDBFactory
		const cacheStorage = {
			delete: vi.fn().mockRejectedValue(new Error("cache delete failed")),
		} as unknown as CacheStorage

		await expect(
			cleanupLegacyCanvasMediaStorage({ indexedDBFactory, cacheStorage }),
		).resolves.toBeUndefined()
	})

	it("does not read metadata from the incompatible v1 path-key namespace", async () => {
		const requestUrl = buildVirtualUrl("images/example.png")
		await saveCanvasEntry(
			{
				id: "workspace/project/design/demo/image/./images/example.png",
				namespace: "workspace/project/design/demo",
				path: "./images/example.png",
				mediaType: "image",
				cacheKey: requestUrl,
				sourceUrl: "https://oss.example.com/images/example.png",
			},
			{ dbName: "canvas-media-resource-offline-cache-v1", dbVersion: 1 },
		)

		const response = await handleCanvasMediaRequest(new Request(requestUrl))

		expect(response?.status).toBe(404)
	})

	it("parses canvas virtual urls with unicode paths", () => {
		const result = parseVirtualResourceRequest(
			`${TEST_ORIGIN}/sw/canvas-design-media/workspace/project/design/demo/image/design-resource/%E6%B5%8B%E8%AF%95%E7%94%BB%E5%B8%83/images/%E7%8C%AB.jpg`,
		)

		expect(result).toEqual({
			namespace: "workspace/project/design/demo",
			mediaType: "image",
			resourcePath: "测试画布/images/猫.jpg",
		})
	})

	it("encodes URL delimiters in path segments and restores them during lookup", () => {
		const resourcePath = "images/真丝系列#13 娃娃领?x%25.png"
		const requestUrl = buildVirtualUrl(resourcePath)
		expect(parseVirtualResourceRequest(requestUrl)?.resourcePath).toBe(resourcePath)

		expect(requestUrl).toContain("%2313%20")
		expect(requestUrl).toContain("%3Fx%2525.png")
		expect(parseVirtualResourceRequest(requestUrl)).toEqual({
			namespace: "workspace/project/design/demo",
			mediaType: "image",
			resourcePath,
		})
	})

	it("serves cached resources whose filenames contain URL delimiters", async () => {
		const resourcePath = "images/真丝系列#13 娃娃领?x%25.png"
		const requestUrl = buildVirtualUrl(resourcePath)
		const entry: StoredCanvasEntry = {
			id: `workspace/project/design/demo/image/${resourcePath}`,
			namespace: "workspace/project/design/demo",
			path: resourcePath,
			mediaType: "image",
			cacheKey: requestUrl,
			sourceUrl: "https://oss.example.com/images/source.png",
		}

		await saveCanvasEntry(entry)
		const cache = await caches.open(CANVAS_MEDIA_CACHE_NAME)
		await cache.put(requestUrl, new Response("cached-delimited-image", { status: 200 }))

		const response = await handleCanvasMediaRequest(new Request(requestUrl))

		expect(response?.status).toBe(200)
		expect(await response?.text()).toBe("cached-delimited-image")
	})

	it("parses audio virtual urls without changing the v4 cache namespace", () => {
		expect(parseVirtualResourceRequest(buildVirtualUrl("audios/voice.mp3", "audio"))).toEqual({
			namespace: "workspace/project/design/demo",
			mediaType: "audio",
			resourcePath: "audios/voice.mp3",
		})
		expect(CANVAS_MEDIA_OFFLINE_CACHE_VERSION).toBe(4)
	})

	it("returns cached canvas response when cache entry exists", async () => {
		const requestUrl = buildVirtualUrl("images/example.png")
		const entry: StoredCanvasEntry = {
			id: "workspace/project/design/demo/image/images/example.png",
			namespace: "workspace/project/design/demo",
			path: "images/example.png",
			mediaType: "image",
			cacheKey: requestUrl,
			sourceUrl: "https://oss.example.com/images/example.png",
		}
		await saveCanvasEntry(entry)
		const cache = await caches.open(CANVAS_MEDIA_CACHE_NAME)
		await cache.put(requestUrl, new Response("cached-image", { status: 200 }))

		const response = await handleCanvasMediaRequest(new Request(requestUrl))

		expect(response).not.toBeNull()
		expect(await response?.text()).toBe("cached-image")
	})

	it("fetches sourceUrl and stores response when cache misses", async () => {
		const requestUrl = buildVirtualUrl("images/example.png")
		const entry: StoredCanvasEntry = {
			id: "workspace/project/design/demo/image/images/example.png",
			namespace: "workspace/project/design/demo",
			path: "images/example.png",
			mediaType: "image",
			cacheKey: requestUrl,
			sourceUrl: "https://oss.example.com/images/example.png",
		}
		await saveCanvasEntry(entry)
		const networkBlob = new NodeBlob(["network-image"], { type: "image/png" })
		const networkResponse = new Response(networkBlob, {
			status: 200,
			headers: { "Content-Type": "image/png", ETag: "etag-1" },
		})
		Object.defineProperty(networkResponse, "blob", {
			value: vi.fn(async () => networkBlob),
		})
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(networkResponse)

		const response = await handleCanvasMediaRequest(new Request(requestUrl))
		const cache = await caches.open(CANVAS_MEDIA_CACHE_NAME)
		const cachedResponse = await cache.match(requestUrl)

		expect(fetchSpy).toHaveBeenCalledWith("https://oss.example.com/images/example.png", {
			cache: "default",
		})
		expect(await response?.text()).toBe("network-image")
		expect(await cachedResponse?.text()).toBe("network-image")
	})

	it("caches an audio body and serves byte ranges for playback seeking", async () => {
		const requestUrl = buildVirtualUrl("audios/voice.mp3", "audio")
		const entry: StoredCanvasEntry = {
			id: "workspace/project/design/demo/audio/audios/voice.mp3",
			namespace: "workspace/project/design/demo",
			path: "audios/voice.mp3",
			mediaType: "audio",
			cacheKey: requestUrl,
			sourceUrl: "https://oss.example.com/audios/voice.mp3",
		}
		await saveCanvasEntry(entry)
		const networkBlob = new NodeBlob(["0123456789"], { type: "audio/mpeg" })
		const networkResponse = new Response(networkBlob, {
			status: 200,
			headers: { "Content-Type": "audio/mpeg" },
		})
		Object.defineProperty(networkResponse, "blob", {
			value: vi.fn(async () => networkBlob),
		})
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(networkResponse)
		const rangeResponse = await handleCanvasMediaRequest(
			new Request(requestUrl, { headers: { Range: "bytes=2-5" } }),
		)
		expect(rangeResponse?.status).toBe(206)
		expect(rangeResponse?.headers.get("Content-Range")).toBe("bytes 2-5/10")
		expect(await rangeResponse?.text()).toBe("2345")
		expect(fetchSpy).toHaveBeenCalledTimes(1)

		const invalidRangeResponse = await handleCanvasMediaRequest(
			new Request(requestUrl, { headers: { Range: "bytes=20-30" } }),
		)
		expect(invalidRangeResponse?.status).toBe(416)
	})

	it("handles cache register message and writes resource metadata", async () => {
		const waitUntil = vi.fn((promise: Promise<unknown>) => promise)
		const event = {
			data: {
				type: "CANVAS_MEDIA_CACHE_REGISTER",
				entry: {
					namespace: "workspace/project/design/demo",
					path: "images/example.png",
					mediaType: "image",
					sourceUrl: "https://oss.example.com/images/example.png",
				},
			},
			waitUntil,
		} as unknown as ExtendableMessageEvent

		const handled = handleCanvasMediaMessage(event)
		await Promise.resolve()
		await Promise.resolve()

		expect(handled).toBe(true)
		expect(waitUntil).toHaveBeenCalledTimes(1)
	})

	it("accepts batched cache-hit touch messages", async () => {
		const waitUntil = vi.fn((promise: Promise<unknown>) => promise)
		const event = {
			data: {
				type: "CANVAS_MEDIA_CACHE_TOUCH_BATCH",
				touches: [],
			},
			waitUntil,
		} as unknown as ExtendableMessageEvent

		expect(handleCanvasMediaMessage(event)).toBe(true)
		expect(waitUntil).toHaveBeenCalledTimes(1)
		await waitUntil.mock.results[0]?.value
	})

	it("updates metadata for a non-empty touch batch and suppresses touches within 24 hours", async () => {
		const id = "workspace/project/design/touch-batch/image/images/touch.png"
		const initialAccess = 0
		const firstTouch = 2 * 24 * 60 * 60 * 1000
		await saveCanvasEntry({
			id,
			namespace: "workspace/project/design/touch-batch",
			path: "images/touch.png",
			mediaType: "image",
			lastAccessedAt: initialAccess,
			updatedAt: initialAccess,
		})

		const dispatchTouch = async (lastAccessedAt: number) => {
			const waitUntil = vi.fn((promise: Promise<unknown>) => promise)
			const event = {
				data: {
					type: "CANVAS_MEDIA_CACHE_TOUCH_BATCH",
					touches: [{ id, lastAccessedAt }],
				},
				waitUntil,
			} as unknown as ExtendableMessageEvent
			expect(handleCanvasMediaMessage(event)).toBe(true)
			await waitUntil.mock.results[0]?.value
		}

		await dispatchTouch(firstTouch)
		expect((await readCanvasEntry(id))?.lastAccessedAt).toBe(firstTouch)

		await dispatchTouch(firstTouch + 60 * 60 * 1000)
		expect((await readCanvasEntry(id))?.lastAccessedAt).toBe(firstTouch)
	})
})
