import { describe, expect, it } from "vitest"
import { SensitiveMasker } from "../SensitiveMasker"

describe("SensitiveMasker structured log whitelist", () => {
	it("preserves eventKey while keeping token fields masked", () => {
		const result = SensitiveMasker.sanitize({
			eventKey: "operation_failed",
			accessToken: "secret-token-value",
		})

		expect(result.eventKey).toBe("operation_failed")
		expect(result.accessToken).not.toBe("secret-token-value")
	})
})
