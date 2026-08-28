import { renderHook, act, waitFor } from "@testing-library/react"
import { vi } from "vitest"
import { useImageUrlResolver } from "../useImageUrlResolver"
import type { AttachmentFile } from "@/pages/superMagic/utils/image-url-resolver"

// Mock the image-url-resolver utilities
vi.mock("@/pages/superMagic/utils/image-url-resolver", () => ({
	parseImageSize: vi.fn(() => ({ width: 100, height: 100 })),
	normalizeImagePath: vi.fn((path: string) => `normalized-${path}`),
	resolveSingleImageUrl: vi.fn(async (path: string) => `resolved-${path}`),
}))

describe("useImageUrlResolver", () => {
	const mockAttachments: AttachmentFile[] = [
		{
			file_id: "file1",
			file_name: "image1.png",
			relative_file_path: "images/image1.png",
		},
	]

	it("should initialize with empty imageUrlMap", () => {
		const { result } = renderHook(() =>
			useImageUrlResolver({
				attachments: mockAttachments,
				relativeFilePath: "documents/test.md",
			}),
		)

		expect(result.current.imageUrlMap).toBeInstanceOf(Map)
		expect(result.current.imageUrlMap.size).toBe(0)
		expect(typeof result.current.urlResolver).toBe("function")
		expect(typeof result.current.setImageUrlMap).toBe("function")
	})

	it("should initialize with provided imageUrlMap", () => {
		const initialMap = new Map([
			[
				"test.png",
				{ fileId: "file1", url: "url1", width: 100, height: 100, rawPath: "test.png" },
			],
		])

		const { result } = renderHook(() =>
			useImageUrlResolver({
				attachments: mockAttachments,
				relativeFilePath: "documents/test.md",
				initialImageUrlMap: initialMap,
			}),
		)

		expect(result.current.imageUrlMap).toBe(initialMap)
		expect(result.current.imageUrlMap.size).toBe(1)
	})

	it("should resolve image URL and update cache", async () => {
		const { result } = renderHook(() =>
			useImageUrlResolver({
				attachments: mockAttachments,
				relativeFilePath: "documents/test.md",
			}),
		)

		let resolvedUrl = ""
		await act(async () => {
			resolvedUrl = await result.current.urlResolver("test.png")
		})

		expect(resolvedUrl).toBe("resolved-test.png")
		expect(result.current.imageUrlMap.size).toBe(2) // Both original and normalized paths
		expect(result.current.imageUrlMap.has("test.png")).toBe(true)
	})

	it("should return original path on error", async () => {
		const { resolveSingleImageUrl } =
			await import("@/pages/superMagic/utils/image-url-resolver")
		vi.mocked(resolveSingleImageUrl).mockRejectedValueOnce(new Error("Network error"))

		const { result } = renderHook(() =>
			useImageUrlResolver({
				attachments: mockAttachments,
				relativeFilePath: "documents/test.md",
			}),
		)

		let resolvedUrl = ""
		await act(async () => {
			resolvedUrl = await result.current.urlResolver("test.png")
		})

		expect(resolvedUrl).toBe("test.png")
		expect(result.current.imageUrlMap.size).toBe(0)
	})

	it("should notify image loaders when attachment resolution becomes ready", async () => {
		const listener = vi.fn()
		const { result, rerender } = renderHook(
			({ isReady }: { isReady: boolean }) =>
				useImageUrlResolver({
					attachments: mockAttachments,
					relativeFilePath: "documents/mock-note.md",
					isReady,
				}),
			{ initialProps: { isReady: false } },
		)

		expect(result.current.urlResolver.isReady?.()).toBe(false)
		const unsubscribe = result.current.urlResolver.subscribe?.(listener)

		rerender({ isReady: true })

		await waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
		expect(result.current.urlResolver.isReady?.()).toBe(true)
		unsubscribe?.()
	})
})
