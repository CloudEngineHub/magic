import { afterEach, describe, expect, it, vi } from "vitest"
import type { ProjectFilesStore } from "@/stores/projectFiles"
import {
	releaseAllProjectAttachmentMutationWaiters,
	resolveProjectAttachmentMutationWaiters,
	waitForProjectAttachmentChange,
} from "../attachmentMutationWaiter"

describe("attachmentMutationWaiter", () => {
	afterEach(() => {
		releaseAllProjectAttachmentMutationWaiters()
		vi.useRealTimers()
	})

	it("resolves exact-file waiters when file id and operation match", async () => {
		const store = {} as ProjectFilesStore
		const waiter = waitForProjectAttachmentChange("project-a", {
			store,
			fileIds: ["file-a"],
			operations: ["add"],
			timeoutMs: 5_000,
		})

		resolveProjectAttachmentMutationWaiters({
			projectId: "project-a",
			store,
			changes: [{ file_id: "file-a", operation: "add" }],
			source: "ws",
		})

		await expect(waiter).resolves.toMatchObject({
			projectId: "project-a",
			status: "applied",
			matchMode: "exact-file",
			source: "ws",
		})
	})

	it("resolves project-any-apply waiters on any applied project change", async () => {
		const store = {} as ProjectFilesStore
		const waiter = waitForProjectAttachmentChange("project-a", {
			store,
			matchMode: "project-any-apply",
			timeoutMs: 5_000,
		})

		resolveProjectAttachmentMutationWaiters({
			projectId: "project-a",
			store,
			changes: [{ file_id: "other-file", operation: "update" }],
			source: "ws",
		})

		await expect(waiter).resolves.toMatchObject({
			status: "applied",
			matchMode: "project-any-apply",
		})
	})

	it("times out as unmatched after unrelated changes apply for the same project", async () => {
		vi.useFakeTimers()
		const store = {} as ProjectFilesStore
		const callback = vi.fn()
		const waiter = waitForProjectAttachmentChange("project-a", {
			store,
			fileIds: ["file-a"],
			operations: ["delete"],
			timeoutMs: 20,
			callback,
		})

		resolveProjectAttachmentMutationWaiters({
			projectId: "project-a",
			store,
			changes: [{ file_id: "file-b", operation: "delete" }],
			source: "ws",
		})

		await vi.advanceTimersByTimeAsync(20)

		await expect(waiter).resolves.toMatchObject({
			status: "unmatched",
			matchMode: "exact-file",
		})
		expect(callback).toHaveBeenCalledTimes(1)
	})

	it("does not run callback twice when ws resolves during fallback refresh", async () => {
		vi.useFakeTimers()
		const store = {} as ProjectFilesStore
		const callback = vi.fn()
		const waiter = waitForProjectAttachmentChange("project-a", {
			store,
			fileIds: ["file-a"],
			operations: ["add"],
			timeoutMs: 20,
			fallback: "full-refresh",
			fallbackTimeoutMs: 100,
			callback,
		})

		await vi.advanceTimersByTimeAsync(20)

		resolveProjectAttachmentMutationWaiters({
			projectId: "project-a",
			store,
			changes: [{ file_id: "file-a", operation: "add" }],
			source: "ws",
		})

		await expect(waiter).resolves.toMatchObject({
			status: "applied",
			source: "ws",
		})
		await vi.advanceTimersByTimeAsync(100)
		expect(callback).toHaveBeenCalledTimes(1)
	})
})
