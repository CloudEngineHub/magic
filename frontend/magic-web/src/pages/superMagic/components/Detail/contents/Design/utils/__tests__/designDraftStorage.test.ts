import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DesignData } from "../../types"
import {
	buildDesignDraftKey,
	deleteDesignDraft,
	readDesignDraft,
	writeDesignDraft,
	type DesignDraftIdentity,
	type DesignDraftReason,
} from "../designDraftStorage"

const identity: Required<DesignDraftIdentity> = {
	projectId: "project-1",
	designProjectId: "design-1",
	magicProjectJsFileId: "magic-file-1",
}

function designData(name: string): DesignData {
	return {
		type: "design",
		name,
		version: "2.0.0",
		canvas: { elements: [] },
	}
}

function draftInput(
	name: string,
	localUpdatedAt: number,
	reason: DesignDraftReason = "local-edit",
) {
	return {
		...identity,
		designProjectBasePath: "folder/design",
		baseRemoteVersion: 1,
		baseRemoteFingerprint: "remote-fp",
		localFingerprint: `local-fp-${name}`,
		localUpdatedAt,
		reason,
		designData: designData(name),
	}
}

describe("designDraftStorage fallback", () => {
	beforeEach(async () => {
		vi.unstubAllGlobals()
		localStorage.clear()
		await deleteDesignDraft(identity)
	})

	it("falls back to localStorage when IndexedDB is unavailable", async () => {
		vi.stubGlobal("indexedDB", undefined)

		const result = await writeDesignDraft(draftInput("local-storage", 100))
		const restored = await readDesignDraft(identity)

		expect(result).toEqual({ target: "localStorage", durable: true })
		expect(restored?.designData.name).toBe("local-storage")
	})

	it("writes an emergency pagehide draft to localStorage synchronously", async () => {
		vi.stubGlobal("indexedDB", undefined)

		const writePromise = writeDesignDraft(draftInput("pagehide", 200, "pagehide"), {
			emergency: true,
		})
		const stored = localStorage.getItem(
			`MAGIC:supermagic-design:draft:${buildDesignDraftKey(identity)}`,
		)

		expect(stored).toContain('"name":"pagehide"')
		expect(await writePromise).toEqual({ target: "localStorage", durable: true })
	})

	it("restores the newest draft across storage layers", async () => {
		await writeDesignDraft(draftInput("indexeddb-old", 100))
		vi.stubGlobal("indexedDB", undefined)
		await writeDesignDraft(draftInput("local-storage-new", 300))
		vi.unstubAllGlobals()

		const restored = await readDesignDraft(identity)

		expect(restored?.designData.name).toBe("local-storage-new")
	})

	it("does not throw when the draft cannot be serialized", async () => {
		const circularDesignData = designData("circular") as DesignData & {
			self?: unknown
		}
		circularDesignData.self = circularDesignData

		const result = await writeDesignDraft({
			...draftInput("circular", 400),
			designData: circularDesignData,
		})

		expect(result).toEqual({ target: "none", durable: false })
	})
})
