import { describe, expect, it, vi } from "vitest"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import { clearPostPublishStatusAfterPublishedLinkBind } from "../services/selfMediaPostPublishStatus"

function createPostItem(publishStatus?: "planned" | "archived"): SelfMediaPlatformPostItem {
	return {
		platform: "rednote",
		index: 0,
		entry: {
			id: "post-1",
			name: "Post One",
			entry: "posts/post-1/post.json",
			publishStatus,
		},
		post: {
			meta: {
				id: "post-1",
				title: "Post One",
			},
			cards: [],
		},
	}
}

describe("selfMediaPostPublishStatus", () => {
	it("clears a manual publish status after a published link is bound", async () => {
		const fileStorageService = {
			setPostPublishStatus: vi.fn().mockResolvedValue(undefined),
		}
		const store = {
			updatePlatformPostPublishStatus: vi.fn(),
		}

		await expect(
			clearPostPublishStatusAfterPublishedLinkBind({
				target: createPostItem("archived"),
				fileStorageService,
				store,
			}),
		).resolves.toBe(true)

		expect(fileStorageService.setPostPublishStatus).toHaveBeenCalledWith({
			platform: "rednote",
			id: "post-1",
			entry: "posts/post-1/post.json",
		})
		expect(store.updatePlatformPostPublishStatus).toHaveBeenCalledWith("rednote", "post-1")
	})

	it("keeps storage untouched when the post has no manual publish status", async () => {
		const fileStorageService = {
			setPostPublishStatus: vi.fn().mockResolvedValue(undefined),
		}
		const store = {
			updatePlatformPostPublishStatus: vi.fn(),
		}

		await expect(
			clearPostPublishStatusAfterPublishedLinkBind({
				target: createPostItem(),
				fileStorageService,
				store,
			}),
		).resolves.toBe(false)

		expect(fileStorageService.setPostPublishStatus).not.toHaveBeenCalled()
		expect(store.updatePlatformPostPublishStatus).not.toHaveBeenCalled()
	})
})
