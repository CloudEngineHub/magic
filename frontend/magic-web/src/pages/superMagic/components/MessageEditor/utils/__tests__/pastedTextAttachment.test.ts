import { describe, expect, it } from "vitest"
import { createPastedTextFile, shouldConvertPastedTextToAttachment } from "../pastedTextAttachment"

function createClipboardData({
	text,
	html = "",
	files = [],
	types = ["text/plain"],
}: {
	text: string
	html?: string
	files?: File[]
	types?: string[]
}) {
	return {
		files,
		types,
		getData: (format: string) => {
			if (format === "text/plain") return text
			if (format === "text/html") return html
			return ""
		},
	}
}

describe("pastedTextAttachment", () => {
	it("converts long plain text paste to attachment", () => {
		const clipboardData = createClipboardData({
			text: "a".repeat(10),
		})

		expect(shouldConvertPastedTextToAttachment(clipboardData, 10)).toBe(true)
	})

	it("keeps short plain text paste in editor", () => {
		const clipboardData = createClipboardData({
			text: "a".repeat(9),
		})

		expect(shouldConvertPastedTextToAttachment(clipboardData, 10)).toBe(false)
	})

	it("keeps file paste on the normal file upload path", () => {
		const clipboardData = createClipboardData({
			text: "a".repeat(10),
			files: [new File(["content"], "source.txt", { type: "text/plain" })],
			types: ["Files", "text/plain"],
		})

		expect(shouldConvertPastedTextToAttachment(clipboardData, 10)).toBe(false)
	})

	it("converts long plain text even when clipboard also provides html", () => {
		const clipboardData = createClipboardData({
			text: "a".repeat(10),
			types: ["text/plain", "text/html"],
		})

		expect(shouldConvertPastedTextToAttachment(clipboardData, 10)).toBe(true)
	})

	it("converts long plain text with non-magic editor metadata", () => {
		const clipboardData = createClipboardData({
			text: "a".repeat(10),
			types: ["text/plain", "text/html", "application/vnd.code.copyMetadata"],
		})

		expect(shouldConvertPastedTextToAttachment(clipboardData, 10)).toBe(true)
	})

	it("does not convert Magic clipboard content with custom mime types", () => {
		const clipboardData = createClipboardData({
			text: "a".repeat(10),
			types: ["text/plain", "text/html", "text/x-magic-message-rich-text"],
		})

		expect(shouldConvertPastedTextToAttachment(clipboardData, 10)).toBe(false)
	})

	it("does not convert Magic clipboard content with html metadata", () => {
		const clipboardData = createClipboardData({
			text: "a".repeat(10),
			html: '<div data-magic-clipboard="metadata">content</div>',
			types: ["text/plain", "text/html"],
		})

		expect(shouldConvertPastedTextToAttachment(clipboardData, 10)).toBe(false)
	})

	it("creates a timestamped txt file", () => {
		const now = new Date(2026, 4, 18, 17, 20, 30)
		const file = createPastedTextFile({ text: "hello", now })

		expect(file.name).toBe("pasted-text-20260518-172030.txt")
		expect(file.type).toBe("text/plain;charset=utf-8")
		expect(file.lastModified).toBe(now.getTime())
	})
})
