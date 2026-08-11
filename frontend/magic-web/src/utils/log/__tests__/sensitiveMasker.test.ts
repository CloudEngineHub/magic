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

	it("recursively masks unexpected composite eventKey values", () => {
		const objectResult = SensitiveMasker.sanitize({
			eventKey: { accessToken: "object-secret" },
		})
		const arrayResult = SensitiveMasker.sanitize({
			eventKey: [{ accessToken: "array-secret" }],
		})

		expect(objectResult.eventKey.accessToken).not.toBe("object-secret")
		expect(arrayResult.eventKey[0].accessToken).not.toBe("array-secret")
	})
})
