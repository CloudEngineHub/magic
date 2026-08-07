import { describe, expect, it } from "vitest"
import type { ImageElementV1, ImageElementV2 } from "../types"
import {
	appendImageVersion,
	deleteActiveImageVersion,
	getActiveImageVersion,
	migrateImageElementV1,
	setMainImageVersion,
	switchActiveImageVersion,
	updateImageVersion,
} from "../imageVersion"

function v1(): ImageElementV1 {
	return {
		id: "image-1",
		type: "image",
		x: 10,
		y: 20,
		width: 320,
		height: 180,
		src: "./images/one.png",
		status: "completed",
		generateHightImageRequest: {
			image_id: "high-1",
			file_path: "./images/one.png",
			size: "640x360",
		},
	}
}

describe("imageVersion helpers", () => {
	it("migrates V1 only into a complete first version", () => {
		const migrated = migrateImageElementV1(v1(), "version-1")

		expect(migrated).toMatchObject({
			id: "image-1",
			imageDslVersion: 2,
			activeVersionId: "version-1",
			mainVersionId: "version-1",
			width: 320,
			height: 180,
		})
		expect(migrated.versions).toEqual([
			{
				id: "version-1",
				src: "./images/one.png",
				status: "completed",
				imageGenerationTaskMeta: {
					type: "high",
					image_id: "high-1",
					file_path: "./images/one.png",
					size: "640x360",
				},
			},
		])
		expect(Object.prototype.hasOwnProperty.call(migrated, "src")).toBe(false)
	})

	it("provides active access for V2 without mutating or serializing compatibility fields", () => {
		const element = migrateImageElementV1(v1(), "version-1")
		const next = appendImageVersion(element, {
			id: "version-2",
			src: "./images/two.png",
			status: "completed",
		})
		const v2: ImageElementV2 = switchActiveImageVersion(next, "version-2")
		const beforeKeys = Object.keys(v2)
		const beforeVersions = v2.versions.map((version) => ({ ...version }))
		expect(getActiveImageVersion(v2)).toMatchObject({
			id: "version-2",
			src: "./images/two.png",
		})
		expect(Object.keys(v2)).toEqual(beforeKeys)
		expect(v2.versions).toEqual(beforeVersions)
		expect(Object.prototype.hasOwnProperty.call(v2, "src")).toBe(false)
	})

	it("reads frozen V2 snapshots without installing compatibility accessors", () => {
		const v2 = Object.freeze({
			...migrateImageElementV1(v1(), "version-1"),
			versions: Object.freeze([
				{
					id: "version-1",
					src: "./images/frozen.png",
					status: "completed" as const,
				},
			]),
		}) as unknown as ImageElementV2

		expect(getActiveImageVersion(v2)).toMatchObject({
			id: "version-1",
			src: "./images/frozen.png",
		})
		expect(Object.prototype.hasOwnProperty.call(v2, "src")).toBe(false)
	})

	it("reads sealed V2 snapshots without mutating the snapshot", () => {
		const source = migrateImageElementV1(v1(), "version-1")
		const v2 = Object.seal({
			...source,
			versions: source.versions.map((version) => Object.seal({ ...version })),
		}) as ImageElementV2
		const before = JSON.stringify(v2)

		expect(getActiveImageVersion(v2).id).toBe("version-1")
		expect(JSON.stringify(v2)).toBe(before)
		expect(Object.prototype.hasOwnProperty.call(v2, "src")).toBe(false)
	})

	it("updates, switches, sets main, and deletes the active version deterministically", () => {
		const first = migrateImageElementV1(v1(), "version-1")
		const withSecond = appendImageVersion(first, {
			id: "version-2",
			src: "./images/two.png",
			status: "completed",
		})
		const withThird = appendImageVersion(withSecond, {
			id: "version-3",
			status: "failed",
		})
		const changed = updateImageVersion(withThird, "version-2", {
			crop: { x: 1, y: 2, width: 100, height: 80 },
		}) as ImageElementV2
		const active = switchActiveImageVersion(changed, "version-2")
		const main = setMainImageVersion(active, "version-2")
		const deleted = deleteActiveImageVersion(main)

		expect(deleted?.deletedVersion.id).toBe("version-2")
		expect(deleted?.element.activeVersionId).toBe("version-1")
		expect(deleted?.element.mainVersionId).toBe("version-1")
		expect(deleted?.element.versions.map((version) => version.id)).toEqual([
			"version-1",
			"version-3",
		])
	})
})
