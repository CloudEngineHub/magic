import { Editor } from "@tiptap/core"
import { Document } from "@tiptap/extension-document"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Text } from "@tiptap/extension-text"
import { Slice } from "prosemirror-model"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin/types"
import CopyMessageExtension from "../copy-message"

const mentionAttrs: TiptapMentionAttributes = {
	type: MentionItemType.MEMORY_FILE,
	data: {
		file_id: "memory-file-1",
		file_name: "notes.md",
		file_path: "/notes.md",
		file_extension: "md",
	},
}

const editors: Editor[] = []

afterEach(() => {
	editors.splice(0).forEach((editor) => editor.destroy())
	vi.restoreAllMocks()
})

function createEditor(onMentionsInsert: (items: TiptapMentionAttributes[]) => void) {
	const editor = new Editor({
		content: "",
		extensions: [
			Document,
			Paragraph,
			Text,
			CopyMessageExtension.configure({ onMentionsInsert }),
		],
	})
	editors.push(editor)
	return editor
}

function createClipboardEvent(richText: string | undefined, mentions: unknown[]) {
	const metadata = {
		...(richText !== undefined ? { richText } : {}),
		mentions,
	}
	const encodedMetadata = btoa(encodeURIComponent(JSON.stringify(metadata)))
	const values: Record<string, string> = {
		"text/html": `<div data-magic-clipboard="${encodedMetadata}"></div>`,
	}

	return {
		clipboardData: {
			types: Object.keys(values),
			getData: (type: string) => values[type] ?? "",
		},
	} as ClipboardEvent
}

function getHandlePaste(editor: Editor) {
	const plugin = editor.state.plugins.find((item) => item.props.handlePaste)
	if (!plugin?.props.handlePaste)
		throw new Error("CopyMessageExtension handlePaste is unavailable")
	return plugin.props.handlePaste as (
		view: typeof editor.view,
		event: ClipboardEvent,
		slice: Slice,
	) => boolean
}

describe("CopyMessageExtension handlePaste", () => {
	it.each([
		["missing richText", undefined],
		["empty richText", ""],
		["invalid richText", "not-json"],
	])("syncs mentions when %s", (_label, richText) => {
		const onMentionsInsert = vi.fn()
		const editor = createEditor(onMentionsInsert)
		vi.spyOn(console, "error").mockImplementation(() => undefined)

		const handled = getHandlePaste(editor)(
			editor.view,
			createClipboardEvent(richText, [{ attrs: mentionAttrs }]),
			Slice.empty,
		)

		expect(handled).toBe(false)
		expect(onMentionsInsert).toHaveBeenCalledTimes(1)
		expect(onMentionsInsert).toHaveBeenCalledWith([mentionAttrs])
	})

	it("syncs mentions only after rich text insertion succeeds", () => {
		const onMentionsInsert = vi.fn()
		const editor = createEditor(onMentionsInsert)
		const richText = JSON.stringify({
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
		})

		const handled = getHandlePaste(editor)(
			editor.view,
			createClipboardEvent(richText, [{ attrs: mentionAttrs }]),
			Slice.empty,
		)

		expect(handled).toBe(true)
		expect(onMentionsInsert).toHaveBeenCalledWith([mentionAttrs])
	})

	it("does not sync mentions when rich text insertion fails", () => {
		const onMentionsInsert = vi.fn()
		const editor = createEditor(onMentionsInsert)
		Object.defineProperty(editor, "commands", {
			configurable: true,
			value: {
				focus: vi.fn(),
				insertContent: vi.fn(() => false),
			},
		})
		const richText = JSON.stringify({ type: "doc", content: [] })

		const handled = getHandlePaste(editor)(
			editor.view,
			createClipboardEvent(richText, [{ attrs: mentionAttrs }]),
			Slice.empty,
		)

		expect(handled).toBe(false)
		expect(onMentionsInsert).not.toHaveBeenCalled()
	})
})
