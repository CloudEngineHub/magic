import { render, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import AICardIframe from "../AICardIframe"

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn(),
}))

vi.mock("../../../../contents/HTML/htmlProcessor", () => ({
	processHtmlContent: vi.fn(async ({ content }: { content: string }) => ({
		processedContent: content,
		filePathMapping: new Map(),
	})),
}))

vi.mock("../../../../contents/HTML/utils/fetchInterceptor", () => ({
	injectFetchInterceptorScript: (content: string) => content,
}))

vi.mock("../../../../contents/HTML/IsolatedHTMLRenderer", () => ({
	default: ({ content, fileId }: { content: string; fileId?: string }) => (
		<div data-testid="isolated-html-renderer" data-file-id={fileId}>
			{content}
		</div>
	),
}))

const mockFetch = vi.fn()

function createAttachmentList(overrides?: {
	currentUpdatedAt?: string
	unrelatedUpdatedAt?: string
}) {
	return [
		{
			file_id: "folder",
			is_directory: true,
			children: [
				{
					file_id: "current-html",
					file_name: "index.html",
					relative_file_path: "cards/latest/index.html",
					updated_at: overrides?.currentUpdatedAt ?? "2026-06-20T01:00:00Z",
				},
				{
					file_id: "unrelated-html",
					file_name: "other.html",
					relative_file_path: "cards/other.html",
					updated_at: overrides?.unrelatedUpdatedAt ?? "2026-06-20T01:00:00Z",
				},
			],
		},
	]
}

function renderIframe(overrides?: Partial<ComponentProps<typeof AICardIframe>>) {
	return render(
		<AICardIframe
			fileId="current-html"
			attachmentList={createAttachmentList()}
			showSkeleton={false}
			{...overrides}
		/>,
	)
}

describe("AICardIframe", () => {
	beforeEach(() => {
		vi.mocked(getTemporaryDownloadUrl).mockReset()
		mockFetch.mockReset()
		vi.stubGlobal("fetch", mockFetch)

		vi.mocked(getTemporaryDownloadUrl).mockResolvedValue([
			{ url: "https://example.com/card.html" },
		])
		mockFetch.mockResolvedValue({
			ok: true,
			text: async () => "<html>card</html>",
		})
	})

	it("does not reload when only an unrelated attachment changes", async () => {
		const { rerender } = renderIframe()

		await waitFor(() => {
			expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
		})

		rerender(
			<AICardIframe
				fileId="current-html"
				attachmentList={createAttachmentList({
					unrelatedUpdatedAt: "2026-06-20T02:00:00Z",
				})}
				showSkeleton={false}
			/>,
		)

		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
	})

	it("reloads when the current html file changes", async () => {
		const { rerender } = renderIframe()

		await waitFor(() => {
			expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
		})

		rerender(
			<AICardIframe
				fileId="current-html"
				attachmentList={createAttachmentList({
					currentUpdatedAt: "2026-06-20T02:00:00Z",
				})}
				showSkeleton={false}
			/>,
		)

		await waitFor(() => {
			expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(2)
		})
	})
})
