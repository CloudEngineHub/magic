import { describe, expect, it } from "vitest"
import { createStreamingJsonStringFieldParser } from "../streamingJsonStringField"

describe("createStreamingJsonStringFieldParser", () => {
	it("resolves a JSON string field only after the streamed value closes", () => {
		const parser = createStreamingJsonStringFieldParser({ field: "file_path" })

		expect(parser.parse('{"file_')).toEqual({ status: "pending" })
		expect(parser.parse('{"file_path": "/app/项目/流式')).toEqual({ status: "pending" })
		expect(parser.parse('{"file_path": "/app/项目/流式报告.html"')).toEqual({
			status: "resolved",
			value: "/app/项目/流式报告.html",
		})
	})

	it("supports escaped JSON characters through a caller transform", () => {
		const parser = createStreamingJsonStringFieldParser({
			field: "file_path",
			transform: (value) => value.replace(/\\/g, "/"),
		})

		expect(parser.parse('{"file_path": "C:\\\\workspace\\\\报\\"告.html"')).toEqual({
			status: "resolved",
			value: 'C:/workspace/报"告.html',
		})
	})

	it("resets when authoritative arguments replace the previous prefix", () => {
		const parser = createStreamingJsonStringFieldParser({ field: "file_path" })

		expect(parser.parse('{"file_path": "/app/旧名称.html"')).toEqual({
			status: "resolved",
			value: "/app/旧名称.html",
		})
		expect(parser.parse('{"file_path": "/app/新名称.html"')).toEqual({
			status: "resolved",
			value: "/app/新名称.html",
		})
	})

	it("stops at the scan limit when the field is after a large leading value", () => {
		const parser = createStreamingJsonStringFieldParser({
			field: "file_path",
			scanLimit: 4 * 1024,
		})
		const oversizedLeadingValue = "x".repeat(5 * 1024)

		expect(
			parser.parse(`{"content":"${oversizedLeadingValue}","file_path":"/app/too-late.html"}`),
		).toEqual({
			status: "exhausted",
		})
	})
})
