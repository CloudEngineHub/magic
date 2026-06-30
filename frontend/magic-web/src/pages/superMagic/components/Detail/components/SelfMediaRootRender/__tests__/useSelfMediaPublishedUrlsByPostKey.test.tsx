import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useSelfMediaPublishedUrlsByPostKey } from "../hooks/useSelfMediaPublishedUrlsByPostKey"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"

const POST_KEY = "rednote:0:posts/post-1/post.json"

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
			},
			cards: [],
		},
	}
}

function PublishedUrlProbe({
	opsArtifactStateSignature,
	onLoadPublishedUrl,
}: {
	opsArtifactStateSignature: string
	onLoadPublishedUrl: (target: SelfMediaPlatformPostItem) => Promise<string | undefined>
}) {
	const urlsByPostKey = useSelfMediaPublishedUrlsByPostKey({
		posts: [createPostItem()],
		artifactsByPostKey: new Map([
			[POST_KEY, { source: false, metrics: false, comments: false, review: false }],
		]),
		opsArtifactStateSignature,
		onLoadPublishedUrl,
	})

	return <div data-testid="published-url">{urlsByPostKey.get(POST_KEY) || ""}</div>
}

describe("useSelfMediaPublishedUrlsByPostKey", () => {
	it("retries a previously empty published-link lookup after the artifact signature changes", async () => {
		const onLoadPublishedUrl = vi
			.fn<Parameters<typeof PublishedUrlProbe>[0]["onLoadPublishedUrl"]>()
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(" https://example.com/published ")

		const { rerender } = render(
			<PublishedUrlProbe
				opsArtifactStateSignature="post-1:source:missing:v1"
				onLoadPublishedUrl={onLoadPublishedUrl}
			/>,
		)

		await waitFor(() => expect(onLoadPublishedUrl).toHaveBeenCalledTimes(1))

		rerender(
			<PublishedUrlProbe
				opsArtifactStateSignature="post-1:source:missing:v1"
				onLoadPublishedUrl={onLoadPublishedUrl}
			/>,
		)
		expect(onLoadPublishedUrl).toHaveBeenCalledTimes(1)

		rerender(
			<PublishedUrlProbe
				opsArtifactStateSignature="post-1:source:missing:v2"
				onLoadPublishedUrl={onLoadPublishedUrl}
			/>,
		)

		await waitFor(() => expect(onLoadPublishedUrl).toHaveBeenCalledTimes(2))
		expect(screen.getByTestId("published-url")).toHaveTextContent(
			"https://example.com/published",
		)
	})
})
