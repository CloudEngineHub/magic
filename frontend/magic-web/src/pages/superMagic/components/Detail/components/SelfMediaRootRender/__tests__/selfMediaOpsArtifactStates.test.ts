import { describe, expect, it } from "vitest"
import {
	buildPostOpsArtifactStates,
	diffPostOpsArtifactAnimations,
} from "../services/selfMediaOpsArtifactStates"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type { SelfMediaAttachmentNode } from "../types"

function createPostItem(): SelfMediaPlatformPostItem {
	return {
		platform: "rednote",
		index: 0,
		entry: {
			id: "post-1",
			name: "Post One",
			entry: "posts/post-1/post.json",
		},
		post: {
			meta: {
				id: "post-1",
				title: "Post One",
				feedTitle: "Post One Feed",
			},
			cards: [],
		},
	}
}

function file(relativePath: string, fileId: string, version: string): SelfMediaAttachmentNode {
	return {
		file_id: fileId,
		file_name: relativePath.split("/").at(-1) || fileId,
		relative_file_path: relativePath,
		updated_at: version,
		is_directory: false,
	}
}

describe("self-media ops artifact states", () => {
	it("diffs only the four target ops artifact paths", () => {
		const item = createPostItem()
		const initial = buildPostOpsArtifactStates(item, [
			file("posts/post-1/ops/source.json", "source-1", "v1"),
			file("posts/post-1/cards/01.html", "card-1", "v1"),
		])

		expect(initial.source.ready).toBe(true)
		expect(initial.metrics.ready).toBe(false)
		expect(initial.comments.ready).toBe(false)
		expect(initial.review.ready).toBe(false)

		const unrelatedUpdated = buildPostOpsArtifactStates(item, [
			file("posts/post-1/ops/source.json", "source-1", "v1"),
			file("posts/post-1/cards/01.html", "card-1", "v2"),
		])
		expect(diffPostOpsArtifactAnimations(initial, unrelatedUpdated)).toEqual({})

		const metricsCreated = buildPostOpsArtifactStates(item, [
			file("posts/post-1/ops/source.json", "source-1", "v1"),
			file("posts/post-1/ops/metrics.json", "metrics-1", "v1"),
			file("posts/post-1/cards/01.html", "card-1", "v2"),
		])
		expect(diffPostOpsArtifactAnimations(initial, metricsCreated)).toEqual({
			metrics: "created",
		})

		const metricsUpdated = buildPostOpsArtifactStates(item, [
			file("posts/post-1/ops/source.json", "source-1", "v1"),
			file("posts/post-1/ops/metrics.json", "metrics-1", "v2"),
			file("posts/post-1/cards/01.html", "card-1", "v3"),
		])
		expect(diffPostOpsArtifactAnimations(metricsCreated, metricsUpdated)).toEqual({
			metrics: "updated",
		})
	})
})
