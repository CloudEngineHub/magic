import { beforeEach, describe, expect, it, vi } from "vitest"
import { ResourceType } from "../../types"
import { resolveContentSharedType, trackContentSharedIfCreated } from "../trackContentShared"

const { track } = vi.hoisted(() => ({ track: vi.fn() }))

vi.mock("@/services/analytics", () => ({ track }))

describe("resolveContentSharedType", () => {
	it("maps each ResourceType to the analytics content_type", () => {
		expect(resolveContentSharedType(ResourceType.Topic)).toBe("topic")
		expect(resolveContentSharedType(ResourceType.Project)).toBe("project")
		expect(resolveContentSharedType(ResourceType.FileCollection)).toBe("file")
		expect(resolveContentSharedType(ResourceType.File)).toBe("file")
	})

	it("returns null for unknown resource types", () => {
		expect(resolveContentSharedType(99)).toBeNull()
	})

	it("maps the existing FileCollection + share_project request to project", () => {
		expect(resolveContentSharedType(ResourceType.FileCollection, { shareProject: true })).toBe(
			"project",
		)
	})
})

describe("trackContentSharedIfCreated", () => {
	beforeEach(() => {
		track.mockReset()
	})

	it("tracks a successful create exactly once", () => {
		trackContentSharedIfCreated({
			created: true,
			resourceId: "share-1",
			resourceType: ResourceType.Topic,
		})

		expect(track).toHaveBeenCalledTimes(1)
		expect(track).toHaveBeenCalledWith("content_shared", {
			content_type: "topic",
			content_id: "share-1",
		})
	})

	it("does not track updates of an existing share", () => {
		trackContentSharedIfCreated({
			created: false,
			resourceId: "share-1",
			resourceType: ResourceType.FileCollection,
		})

		expect(track).not.toHaveBeenCalled()
	})

	it("does not track when create failed to produce a resource id", () => {
		trackContentSharedIfCreated({
			created: true,
			resourceId: "  ",
			resourceType: ResourceType.File,
		})

		expect(track).not.toHaveBeenCalled()
	})

	it("tracks file and project creates with the mapped type", () => {
		trackContentSharedIfCreated({
			created: true,
			resourceId: "file-share",
			resourceType: ResourceType.FileCollection,
		})
		trackContentSharedIfCreated({
			created: true,
			resourceId: "project-share",
			resourceType: ResourceType.FileCollection,
			shareProject: true,
		})

		expect(track).toHaveBeenNthCalledWith(1, "content_shared", {
			content_type: "file",
			content_id: "file-share",
		})
		expect(track).toHaveBeenNthCalledWith(2, "content_shared", {
			content_type: "project",
			content_id: "project-share",
		})
	})

	it("does not track unknown resource types even on create", () => {
		trackContentSharedIfCreated({
			created: true,
			resourceId: "unknown-share",
			resourceType: 99,
		})

		expect(track).not.toHaveBeenCalled()
	})
})
