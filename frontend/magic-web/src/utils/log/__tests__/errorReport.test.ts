import { describe, expect, it } from "vitest"
import { createErrorReport, createProviderErrorInput, parseErrorCall } from "../errorReport"

describe("errorReport protocol", () => {
	it("keeps legacy strings, objects, errors, and multi-argument calls compatible", () => {
		const error = new Error("failed")

		expect(parseErrorCall(["operation_failed", error]).kind).toBe("legacy")
		expect(parseErrorCall([{ operation: "save" }]).kind).toBe("legacy")
		expect(parseErrorCall([error]).kind).toBe("legacy")
	})

	it("recognizes only complete structured inputs", () => {
		const valid = parseErrorCall([
			{ eventKey: "operation_failed", errorKind: "quota", message: "save failed" },
		])
		const invalid = parseErrorCall([{ eventKey: "operation_failed" }])

		expect(valid.kind).toBe("structured")
		expect(invalid.kind).toBe("invalid-structured")
	})

	it("preserves the original Error for the Provider and serializes it for self reporting", () => {
		const error = new TypeError("database unavailable")
		const parsed = parseErrorCall([
			{ eventKey: "operation_failed", errorKind: "database", error },
		])

		expect(parsed.kind).toBe("structured")
		if (parsed.kind !== "structured") return

		const providerInput = createProviderErrorInput(parsed, "repository", "event-1", "3.10.7")
		const report = createErrorReport(parsed.input, "repository", "event-1", "3.10.7")

		expect(providerInput.value).toBe(error)
		expect(providerInput.attributes.release).toBe("3.10.7")
		expect(report).toMatchObject({
			namespace: "repository",
			eventKey: "operation_failed",
			errorKind: "database",
			eventId: "event-1",
			release: "3.10.7",
			captureSource: "manual",
			error: {
				name: "TypeError",
				message: "database unavailable",
			},
		})
		expect(report.error).not.toBe(error)
	})

	it("uses a stable fallback for non-Error structured values", () => {
		const parsed = parseErrorCall([
			{ eventKey: "connection_failed", errorKind: "network", error: { code: 1 } },
		])

		expect(parsed.kind).toBe("structured")
		if (parsed.kind !== "structured") return

		const providerInput = createProviderErrorInput(parsed, "websocket", "event-2", "sha-1")
		expect(providerInput.fallbackMessage).toBe("connection_failed")
	})
})
