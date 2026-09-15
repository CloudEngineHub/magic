import { describe, expect, it } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { MemoryFilesStore } from "../index"

const identityA = "cluster-a:organization-a:user-a"
const identityB = "cluster-a:organization-a:user-b"
const attachmentA = { file_id: "memory-a", file_name: "MEMORY.md" } as AttachmentItem
const attachmentB = { file_id: "memory-b", file_name: "MEMORY.md" } as AttachmentItem

function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve
	})
	return { promise, resolve }
}

function createStore(initialIdentityKey: string | null = identityA) {
	let identityKey = initialIdentityKey
	return {
		store: new MemoryFilesStore(() => identityKey),
		setIdentityKey(nextIdentityKey: string | null) {
			identityKey = nextIdentityKey
		},
	}
}

describe("MemoryFilesStore", () => {
	it("shows loading on first load and stores the result", async () => {
		const { store } = createStore()
		const deferred = createDeferred<AttachmentItem[]>()
		const loadingPromise = store.load(() => deferred.promise)

		expect(store.getSnapshot()).toMatchObject({ attachments: [], loading: true })
		deferred.resolve([attachmentA])
		await loadingPromise

		expect(store.getSnapshot()).toMatchObject({
			attachments: [attachmentA],
			hasLoaded: true,
			loading: false,
		})
	})

	it("keeps existing data visible during the default silent reload", async () => {
		const { store } = createStore()
		await store.load(async () => [attachmentA])
		const deferred = createDeferred<AttachmentItem[]>()
		const reloadPromise = store.load(() => deferred.promise)

		expect(store.getSnapshot()).toMatchObject({ attachments: [attachmentA], loading: false })
		deferred.resolve([attachmentB])
		await reloadPromise
		expect(store.getSnapshot().attachments).toEqual([attachmentB])
	})

	it("clears data and does not expose the previous identity", async () => {
		const { store, setIdentityKey } = createStore()
		await store.load(async () => [attachmentA])
		setIdentityKey(identityB)

		expect(store.getSnapshot()).toMatchObject({ attachments: [], loading: true })
		await store.load(async () => [attachmentB])
		expect(store.getSnapshot().attachments).toEqual([attachmentB])
	})

	it("ignores an old request result after switching identities", async () => {
		const { store, setIdentityKey } = createStore()
		const deferredA = createDeferred<AttachmentItem[]>()
		const requestA = store.load(() => deferredA.promise)
		setIdentityKey(identityB)
		await store.load(async () => [attachmentB])

		deferredA.resolve([attachmentA])
		await requestA
		expect(store.getSnapshot().attachments).toEqual([attachmentB])
	})

	it("uses explicit non-silent loading for manual refresh", async () => {
		const { store } = createStore()
		await store.load(async () => [attachmentA])
		const deferred = createDeferred<AttachmentItem[]>()
		const refreshPromise = store.load(() => deferred.promise, { silent: false })

		expect(store.getSnapshot().loading).toBe(true)
		deferred.resolve([attachmentB])
		await refreshPromise
		expect(store.getSnapshot().loading).toBe(false)
	})

	it("does not block the loader when identity fields are temporarily empty", async () => {
		const { store, setIdentityKey } = createStore("::")
		let loadCount = 0

		await store.load(async () => {
			loadCount += 1
			return [attachmentA]
		})
		expect(loadCount).toBe(1)

		setIdentityKey(identityA)
		await store.load(async () => {
			loadCount += 1
			return [attachmentA]
		})
		expect(loadCount).toBe(2)
	})
})
