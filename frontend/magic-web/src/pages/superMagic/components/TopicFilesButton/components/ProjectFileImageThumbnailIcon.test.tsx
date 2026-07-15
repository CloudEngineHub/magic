import { fireEvent, render, screen, waitFor, act } from "@testing-library/react"
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import { useEffect, type ReactNode } from "react"
import type { AttachmentItem } from "../hooks/types"
import { ProjectFileImageThumbnailIcon } from "./ProjectFileImageThumbnailIcon"
import {
	ProjectFileImagePreviewProvider,
	ProjectFileImagePreviewTooltipContent,
	resolveProjectFileImagePreviewSource,
	useProjectFileImagePreviewManager,
} from "./ProjectFileImagePreviewProvider"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn(),
}))

function PreviewHarness({
	attachments,
	children,
}: {
	attachments: AttachmentItem[]
	children: ReactNode
}) {
	const manager = useProjectFileImagePreviewManager({ attachments })

	useEffect(() => {
		manager.setMountedItems(attachments)
	}, [attachments, manager.setMountedItems])

	return (
		<ProjectFileImagePreviewProvider manager={manager}>
			{children}
		</ProjectFileImagePreviewProvider>
	)
}

function ImageTooltipContentHarness({ item }: { item: AttachmentItem }) {
	const source = resolveProjectFileImagePreviewSource(item)
	if (!source) return null

	return (
		<>
			<ProjectFileImageThumbnailIcon
				item={item}
				fallback={<div data-testid="fallback-icon" />}
			/>
			<ProjectFileImagePreviewTooltipContent source={source} />
		</>
	)
}

describe("ProjectFileImageThumbnailIcon", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("renders an explicit thumbnail url directly", async () => {
		const item: AttachmentItem = {
			file_id: "file-direct",
			file_name: "cover.png",
			file_extension: "png",
			thumbnail_url: "https://cdn.example.com/cover-thumb.webp",
		}

		render(
			<ProjectFileImageThumbnailIcon
				item={item}
				fallback={<div data-testid="fallback-icon" />}
			/>,
		)

		const image = screen.getByTestId("project-file-image-thumbnail-image")
		expect(image).toHaveAttribute("src", "https://cdn.example.com/cover-thumb.webp")
		expect(getTemporaryDownloadUrl).not.toHaveBeenCalled()

		fireEvent.load(image)

		await waitFor(() => {
			expect(
				screen.queryByTestId("project-file-image-thumbnail-loading"),
			).not.toBeInTheDocument()
		})
	})

	it("batches mounted image thumbnails through the list-level manager", async () => {
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce([
			{
				file_id: "file-a",
				url: "https://cdn.example.com/a-thumb.webp",
				expires_at: "2099-01-01 00:00:00",
			},
			{
				file_id: "file-b",
				url: "https://cdn.example.com/b-thumb.webp",
				expires_at: "2099-01-01 00:00:00",
			},
		])

		const attachments: AttachmentItem[] = [
			{
				file_id: "file-a",
				file_name: "a.png",
				file_extension: "png",
			},
			{
				file_id: "file-b",
				file_name: "b.png",
				file_extension: "png",
			},
		]

		render(
			<PreviewHarness attachments={attachments}>
				<div>
					<ProjectFileImageThumbnailIcon
						item={attachments[0]}
						fallback={<div data-testid="fallback-a" />}
					/>
					<ProjectFileImageThumbnailIcon
						item={attachments[1]}
						fallback={<div data-testid="fallback-b" />}
					/>
				</div>
			</PreviewHarness>,
		)

		await waitFor(() => {
			expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
		})

		expect(vi.mocked(getTemporaryDownloadUrl)).toHaveBeenCalledWith({
			file_ids: ["file-a", "file-b"],
			options: {
				xMagicImageProcess: {
					resize: { w: 320, h: 320, m: "lfit" },
					quality: 45,
					format: "webp",
					autoOrient: 1,
				},
			},
			enableErrorMessagePrompt: false,
		})

		expect(await screen.findAllByTestId("project-file-image-thumbnail-image")).toHaveLength(2)
	})

	it("reuses the list preview url in the image tooltip content", async () => {
		vi.useFakeTimers()
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce([
			{
				file_id: "file-hover",
				url: "https://cdn.example.com/hover-preview.webp",
				expires_at: "2099-01-01 00:00:00",
			},
		])

		const item: AttachmentItem = {
			file_id: "file-hover",
			file_name: "hover.png",
			file_extension: "png",
		}

		render(
			<PreviewHarness attachments={[item]}>
				<ImageTooltipContentHarness item={item} />
			</PreviewHarness>,
		)

		await act(async () => {
			vi.advanceTimersByTime(80)
			await Promise.resolve()
			await Promise.resolve()
		})

		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
		expect(vi.mocked(getTemporaryDownloadUrl)).toHaveBeenCalledWith({
			file_ids: ["file-hover"],
			options: {
				xMagicImageProcess: {
					resize: { w: 320, h: 320, m: "lfit" },
					quality: 45,
					format: "webp",
					autoOrient: 1,
				},
			},
			enableErrorMessagePrompt: false,
		})

		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)

		expect(screen.getByTestId("project-file-image-preview-tooltip")).toBeInTheDocument()
		expect(screen.getByTestId("project-file-image-preview-tooltip-title")).toHaveTextContent(
			"hover.png",
		)
		const tooltipImage = screen.getByTestId("project-file-image-preview-tooltip-image")
		Object.defineProperty(tooltipImage, "naturalWidth", {
			value: 320,
			configurable: true,
		})
		Object.defineProperty(tooltipImage, "naturalHeight", {
			value: 180,
			configurable: true,
		})
		await act(async () => {
			fireEvent.load(tooltipImage)
		})
		expect(tooltipImage).toHaveStyle({
			width: "320px",
			height: "180px",
		})
		expect(tooltipImage).toHaveAttribute("src", "https://cdn.example.com/hover-preview.webp")
	})

	it("does not reuse another file url when a batch response misses one item", async () => {
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce([
			{
				file_id: "file-missing-a",
				url: "https://cdn.example.com/missing-a-thumb.webp",
				expires_at: "2099-01-01 00:00:00",
			},
		])

		const attachments: AttachmentItem[] = [
			{
				file_id: "file-missing-a",
				file_name: "a.png",
				file_extension: "png",
			},
			{
				file_id: "file-missing-b",
				file_name: "b.png",
				file_extension: "png",
			},
		]

		render(
			<PreviewHarness attachments={attachments}>
				<div>
					<ProjectFileImageThumbnailIcon
						item={attachments[0]}
						fallback={<div data-testid="fallback-a" />}
					/>
					<ProjectFileImageThumbnailIcon
						item={attachments[1]}
						fallback={<div data-testid="fallback-b" />}
					/>
				</div>
			</PreviewHarness>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("fallback-b")).toBeInTheDocument()
		})

		const images = screen.getAllByTestId("project-file-image-thumbnail-image")
		expect(images).toHaveLength(1)
		expect(images[0]).toHaveAttribute("src", "https://cdn.example.com/missing-a-thumb.webp")
	})

	it("falls back to the file icon for non-image files", () => {
		const item: AttachmentItem = {
			file_id: "file-text",
			file_name: "notes.txt",
			file_extension: "txt",
		}

		render(
			<ProjectFileImageThumbnailIcon
				item={item}
				fallback={<div data-testid="fallback-icon" />}
			/>,
		)

		expect(screen.getByTestId("fallback-icon")).toBeInTheDocument()
		expect(screen.queryByTestId("project-file-image-thumbnail")).not.toBeInTheDocument()
		expect(getTemporaryDownloadUrl).not.toHaveBeenCalled()
	})

	it("falls back when the thumbnail image fails to load", async () => {
		const item: AttachmentItem = {
			file_id: "file-error",
			file_name: "broken.png",
			file_extension: "png",
			thumbnail_url: "https://cdn.example.com/broken-thumb.webp",
		}

		render(
			<ProjectFileImageThumbnailIcon
				item={item}
				fallback={<div data-testid="fallback-icon" />}
			/>,
		)

		fireEvent.error(screen.getByTestId("project-file-image-thumbnail-image"))

		await waitFor(() => {
			expect(screen.getByTestId("fallback-icon")).toBeInTheDocument()
		})
	})
})
