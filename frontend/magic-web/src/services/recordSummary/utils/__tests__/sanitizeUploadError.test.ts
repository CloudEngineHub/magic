import { describe, expect, it } from "vitest"
import { redactUploadErrorMessage } from "../sanitizeUploadError"

describe("redactUploadErrorMessage", () => {
	it("redacts standalone bearer credentials", () => {
		const secret = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret"

		expect(redactUploadErrorMessage(`Unauthorized Bearer ${secret}`)).toBe(
			"Unauthorized Bearer [REDACTED]",
		)
	})

	it("redacts credential fields in JSON and query-like text", () => {
		const message = redactUploadErrorMessage(
			'API rejected {"token":"token-secret","access_token":"access-secret"} with refresh_token=refresh-secret&signature=signature-secret',
		)

		expect(message).not.toContain("token-secret")
		expect(message).not.toContain("access-secret")
		expect(message).not.toContain("refresh-secret")
		expect(message).not.toContain("signature-secret")
		expect(message).toContain("[REDACTED]")
	})

	it("redacts complete URLs", () => {
		const message = redactUploadErrorMessage(
			"Failed to fetch https://oss.example.com/upload?token=query-secret",
		)

		expect(message).toBe("Failed to fetch [url]")
		expect(message).not.toContain("query-secret")
	})
})
