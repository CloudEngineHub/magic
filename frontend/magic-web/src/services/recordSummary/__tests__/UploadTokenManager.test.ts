import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { UploadTokenManager } from "../UploadTokenManager"

vi.mock("@/services/recordSummary/utils/RecordingLogger", () => {
	const logger = {
		log: vi.fn(),
		report: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		namespace: vi.fn(() => logger),
	}
	return { recordingLogger: logger }
})

vi.mock("../RecordingErrorManager", () => ({
	isTaskEndError: vi.fn(() => false),
	createTaskEndError: vi.fn(),
	defaultErrorManager: { handleTaskEnd: vi.fn() },
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getRecordingSummaryUploadToken: vi.fn(),
	},
}))

const SECRET_ERRORS = {
	authorization: new Error("authorization: Bearer secret-authorization-value"),
	bearer: new Error("Unauthorized Bearer test-upload-bearer-credential"),
	urlQueryToken: new Error(
		"Failed to fetch https://oss.example.com/upload?token=secret-query-token&authorization=Bearer%20abc",
	),
	jsonBodyToken: new Error(
		'API rejected {"token":"secret-json-token","access_token":"secret-access","refresh_token":"secret-refresh"}',
	),
}

describe("UploadTokenManager", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it.each(Object.entries(SECRET_ERRORS))(
		"does not leak %s secrets when token fetch retries are exhausted",
		async (_name, apiError) => {
			vi.mocked(SuperMagicApi.getRecordingSummaryUploadToken).mockRejectedValue(apiError)
			const manager = new UploadTokenManager({
				maxRetries: 0,
				retryInterval: 0,
			})

			const error = await manager.getToken("session-1", "topic-1").catch((err) => err)
			expect(error).toBeInstanceOf(Error)
			const message = (error as Error).message
			expect(message).toMatch(/Failed to fetch token after 0 retries/)
			expect(message).not.toContain("secret-authorization-value")
			expect(message).not.toContain("test-upload-bearer-credential")
			expect(message).not.toContain("secret-query-token")
			expect(message).not.toContain("secret-json-token")
			expect(message).not.toContain("secret-access")
			expect(message).not.toContain("secret-refresh")
			expect(message).not.toMatch(/Bearer\s+eyJ/)
			expect(message).not.toContain("https://oss.example.com")
		},
	)
})
