import { describe, expect, it, vi } from "vitest"

const sdkMocks = vi.hoisted(() => ({
	upload: vi.fn(),
	progressCallback: undefined as ((progress: number) => void) | undefined,
	successCallback: undefined as ((response: { data: { path: string } }) => void) | undefined,
}))

vi.mock("@dtyq/upload-sdk", () => ({
	Upload: class {
		upload() {
			const callbacks = {
				progress: (callback: (progress: number) => void) => {
					sdkMocks.progressCallback = callback
				},
				success: (callback: (response: { data: { path: string } }) => void) => {
					sdkMocks.successCallback = callback
				},
				fail: vi.fn(),
				cancel: vi.fn(),
				pause: vi.fn(),
				resume: vi.fn(),
			}
			sdkMocks.upload(callbacks)
			return callbacks
		}
	},
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			organizationCode: "organization-1",
			authorization: "authorization",
		},
	},
}))

vi.mock("@/utils/env", () => ({
	env: vi.fn(() => "https://example.com"),
	isCommercial: vi.fn(() => false),
}))

vi.mock("@/utils/http", () => ({
	genRequestUrl: vi.fn((path: string) => path),
}))

vi.mock("@/utils/log", () => ({
	logger: {
		createLogger: () => ({
			error: vi.fn(),
			warn: vi.fn(),
		}),
	},
}))

import { UploadService } from "../UploadService"

describe("UploadService", () => {
	it("forwards zero and normalized finite progress values", async () => {
		const onProgress = vi.fn()
		const fileData = {
			id: "file-1",
			name: "demo.txt",
			file: new File(["demo"], "demo.txt", { type: "text/plain" }),
			status: "init" as const,
		}
		const service = new UploadService<typeof fileData>()

		const uploadPromise = service.upload({
			fileList: [fileData],
			onProgress,
		})

		sdkMocks.progressCallback?.(0)
		sdkMocks.progressCallback?.(-1)
		sdkMocks.progressCallback?.(42.5)
		sdkMocks.progressCallback?.(101)
		sdkMocks.progressCallback?.(Number.NaN)
		sdkMocks.progressCallback?.(Number.POSITIVE_INFINITY)
		sdkMocks.successCallback?.({ data: { path: "uploads/demo.txt" } })
		await uploadPromise

		expect(onProgress.mock.calls.map(([, progress]) => progress)).toEqual([0, 0, 42.5, 100])
	})
})
