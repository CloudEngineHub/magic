import { describe, expect, it } from "vitest"
import { createStreamingJsonArrayObjectStringFieldParser } from "../streamingJsonArrayObjectField"

describe("createStreamingJsonArrayObjectStringFieldParser", () => {
	it("emits completed item fields incrementally in array order", () => {
		const parser = createStreamingJsonArrayObjectStringFieldParser({
			arrayField: "operations",
			itemField: "file_path",
			format: (values) => values.join("、"),
		})

		expect(parser.parse('{"operations":[{"file_path":"docs/ind')).toEqual({
			status: "pending",
		})
		expect(
			parser.parse('{"operations":[{"file_path":"docs/index.html"},{"file_path":"docs/deta'),
		).toEqual({
			status: "resolved",
			value: "docs/index.html",
		})
		expect(
			parser.parse(
				'{"operations":[{"file_path":"docs/index.html"},{"file_path":"docs/detail.html"}]}',
			),
		).toEqual({
			status: "resolved",
			value: "docs/index.html、docs/detail.html",
		})
	})

	it("only collects direct item fields from the configured array", () => {
		const parser = createStreamingJsonArrayObjectStringFieldParser({
			arrayField: "operations",
			itemField: "file_path",
			format: (values) => values.join("、"),
		})

		expect(
			parser.parse(
				'{"file_path":"outside.html","operations":[{"nested":{"file_path":"nested.html"}},{"file_path":"inside.html"}]}',
			),
		).toEqual({
			status: "resolved",
			value: "inside.html",
		})
	})

	it("deduplicates repeated item values while preserving first-seen order", () => {
		const parser = createStreamingJsonArrayObjectStringFieldParser({
			arrayField: "operations",
			itemField: "file_path",
			format: (values) => values.join("、"),
		})

		expect(
			parser.parse(
				'{"operations":[{"file_path":"a.html"},{"file_path":"a.html"},{"file_path":"b.html"}]}',
			),
		).toEqual({
			status: "resolved",
			value: "a.html、b.html",
		})
	})

	it("resets collected values when authoritative arguments replace the streamed prefix", () => {
		const parser = createStreamingJsonArrayObjectStringFieldParser({
			arrayField: "operations",
			itemField: "file_path",
			format: (values) => values.join("、"),
		})

		expect(parser.parse('{"operations":[{"file_path":"old.html"}]}')).toEqual({
			status: "resolved",
			value: "old.html",
		})
		expect(parser.parse('{"operations":[{"file_path":"final.html"}]}')).toEqual({
			status: "resolved",
			value: "final.html",
		})
	})
})
