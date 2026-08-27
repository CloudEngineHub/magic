import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	getTemporaryDownloadUrl,
	type GetTemporaryDownloadUrlItem,
} from "@/pages/superMagic/utils/api"
import {
	clearSharedFileUrlCache,
	resolveSharedFileUrl,
} from "@/pages/superMagic/services/sharedFileUrlCache"

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn(),
}))

const getTemporaryDownloadUrlMock = vi.mocked(getTemporaryDownloadUrl)

describe("shared file URL cache", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date(2026, 7, 20, 10))
		clearSharedFileUrlCache()
		getTemporaryDownloadUrlMock.mockReset()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("coalesces concurrent requests for the same URL semantics", async () => {
		let resolveRequest: (value: GetTemporaryDownloadUrlItem[]) => void = () => undefined
		getTemporaryDownloadUrlMock.mockImplementation(
			() =>
				new Promise<GetTemporaryDownloadUrlItem[]>((resolve) => {
					resolveRequest = resolve
				}),
		)

		const first = resolveSharedFileUrl({ fileId: "file-1" })
		const second = resolveSharedFileUrl({ fileId: "file-1" })

		expect(getTemporaryDownloadUrlMock).toHaveBeenCalledTimes(1)
		resolveRequest([
			{
				file_id: "file-1",
				url: "https://oss.test/file-1",
				expires_at: "2026-08-20 10:05:00",
			},
		])

		await expect(Promise.all([first, second])).resolves.toEqual([
			expect.objectContaining({ url: "https://oss.test/file-1" }),
			expect.objectContaining({ url: "https://oss.test/file-1" }),
		])
	})

	it("reuses a non-expired URL after the first request settles", async () => {
		getTemporaryDownloadUrlMock.mockResolvedValue([
			{
				file_id: "file-1",
				url: "https://oss.test/file-1",
				expires_at: "2026-08-20 10:05:00",
			},
		])

		await resolveSharedFileUrl({ fileId: "file-1" })
		await resolveSharedFileUrl({ fileId: "file-1" })

		expect(getTemporaryDownloadUrlMock).toHaveBeenCalledTimes(1)
	})

	it("refreshes URLs inside the expiry safety window", async () => {
		getTemporaryDownloadUrlMock
			.mockResolvedValueOnce([
				{
					file_id: "file-1",
					url: "https://oss.test/file-1-old",
					expires_at: "2026-08-20 10:00:20",
				},
			])
			.mockResolvedValueOnce([
				{
					file_id: "file-1",
					url: "https://oss.test/file-1-new",
					expires_at: "2026-08-20 10:05:00",
				},
			])

		await resolveSharedFileUrl({ fileId: "file-1" })
		const refreshed = await resolveSharedFileUrl({ fileId: "file-1" })

		expect(refreshed?.url).toBe("https://oss.test/file-1-new")
		expect(getTemporaryDownloadUrlMock).toHaveBeenCalledTimes(2)
	})

	it("only coalesces responses without expiry metadata", async () => {
		getTemporaryDownloadUrlMock.mockResolvedValue([
			{ file_id: "file-1", url: "https://oss.test/file-1" },
		])

		await resolveSharedFileUrl({ fileId: "file-1" })
		await resolveSharedFileUrl({ fileId: "file-1" })

		expect(getTemporaryDownloadUrlMock).toHaveBeenCalledTimes(2)
	})

	it("does not reuse a URL after the attachment updatedAt changes", async () => {
		getTemporaryDownloadUrlMock
			.mockResolvedValueOnce([
				{
					file_id: "file-1",
					url: "https://oss.test/file-1-old",
					expires_at: "2026-08-20 10:05:00",
				},
			])
			.mockResolvedValueOnce([
				{
					file_id: "file-1",
					url: "https://oss.test/file-1-new",
					expires_at: "2026-08-20 10:05:00",
				},
			])

		await resolveSharedFileUrl({ fileId: "file-1", updatedAt: "v1" })
		const refreshed = await resolveSharedFileUrl({ fileId: "file-1", updatedAt: "v2" })

		expect(refreshed?.url).toBe("https://oss.test/file-1-new")
		expect(getTemporaryDownloadUrlMock).toHaveBeenCalledTimes(2)
	})

	it("does not join an in-flight request from an older attachment revision", async () => {
		let resolveOldRequest: (value: GetTemporaryDownloadUrlItem[]) => void = () => undefined
		let resolveNewRequest: (value: GetTemporaryDownloadUrlItem[]) => void = () => undefined
		getTemporaryDownloadUrlMock
			.mockImplementationOnce(
				() =>
					new Promise<GetTemporaryDownloadUrlItem[]>((resolve) => {
						resolveOldRequest = resolve
					}),
			)
			.mockImplementationOnce(
				() =>
					new Promise<GetTemporaryDownloadUrlItem[]>((resolve) => {
						resolveNewRequest = resolve
					}),
			)

		const oldRequest = resolveSharedFileUrl({ fileId: "file-1", updatedAt: "v1" })
		const newRequest = resolveSharedFileUrl({ fileId: "file-1", updatedAt: "v2" })

		expect(getTemporaryDownloadUrlMock).toHaveBeenCalledTimes(2)
		resolveOldRequest([
			{
				file_id: "file-1",
				url: "https://oss.test/file-1-old",
				expires_at: "2026-08-20 10:05:00",
			},
		])
		resolveNewRequest([
			{
				file_id: "file-1",
				url: "https://oss.test/file-1-new",
				expires_at: "2026-08-20 10:05:00",
			},
		])

		await expect(oldRequest).resolves.toEqual(
			expect.objectContaining({ url: "https://oss.test/file-1-old" }),
		)
		await expect(newRequest).resolves.toEqual(
			expect.objectContaining({ url: "https://oss.test/file-1-new" }),
		)
	})
})
