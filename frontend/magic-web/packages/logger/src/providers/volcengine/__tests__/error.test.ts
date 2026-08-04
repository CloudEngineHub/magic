import { describe, expect, it } from "vitest"
import { normalizeVolcengineError, toVolcengineExtra } from "../error"

describe("normalizeVolcengineError", () => {
	it("keeps the original Error and release attributes", () => {
		const error = new TypeError("failed")
		const result = normalizeVolcengineError([
			{
				kind: "provider-error-input",
				value: error,
				fallbackMessage: "operation_failed",
				attributes: {
					namespace: "repository",
					eventId: "event-1",
					release: "3.10.7",
					captureSource: "manual",
				},
			},
		])

		expect(result.error).toBe(error)
		expect(result.error.name).toBe("TypeError")
		expect(result.attributes).toMatchObject({
			release: "3.10.7",
			syntheticError: false,
		})
		expect(toVolcengineExtra(result.attributes)).toMatchObject({
			namespace: "repository",
			eventId: "event-1",
			release: "3.10.7",
			captureSource: "manual",
			syntheticError: "false",
		})
	})

	it("creates a marked synthetic Error only inside the Provider adapter", () => {
		const result = normalizeVolcengineError([
			{
				kind: "provider-error-input",
				value: "socket timeout",
				fallbackMessage: "connection_failed",
				attributes: {
					namespace: "websocket",
					eventId: "event-2",
					release: "sha-1",
					captureSource: "manual",
				},
			},
		])

		expect(result.error).toBeInstanceOf(Error)
		expect(result.error.name).toBe("MagicLoggerSyntheticError")
		expect(result.error.message).toBe("socket timeout")
		expect(result.attributes.syntheticError).toBe(true)
	})

	it("keeps direct legacy Provider calls compatible", () => {
		const error = new Error("legacy")
		expect(normalizeVolcengineError(["operation_failed", error]).error).toBe(error)
	})
})
