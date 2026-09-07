import { Extension, type JSONContent } from "@/infrastructure/editors/tiptap/core"
import { Plugin, PluginKey } from "prosemirror-state"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { DataService } from "@/components/business/MentionPanel/types"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import {
	serializeMessageClipboard,
	writeMessageClipboardPayload,
} from "@/utils/messageClipboardSerializer"
import { pasteMessageClipboard } from "./pasteMessageClipboard"

interface CopyMessageOptions {
	onMentionsInsert?: (items: TiptapMentionAttributes[]) => void
	onContentChange?: (content: JSONContent) => void
	dataService?: DataService | null
	getWorkspaceFilesList?: () => AttachmentItem[]
}

const CopyMessageExtension = Extension.create<CopyMessageOptions>({
	name: "copyMessage",

	addOptions() {
		return {
			onMentionsInsert: undefined,
			dataService: null,
			getWorkspaceFilesList: undefined,
		}
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey("copyMessage"),

				props: {
					handleDOMEvents: {
						copy: (view, event) => {
							if (!this.options.getWorkspaceFilesList) {
								return false
							}

							const clipboardEvent = event as ClipboardEvent
							const clipboardData = clipboardEvent.clipboardData
							if (!clipboardData) {
								return false
							}

							const payload = serializeMessageClipboard(view)
							if (!payload) {
								return false
							}

							clipboardEvent.preventDefault()
							writeMessageClipboardPayload(clipboardData, payload)

							return true
						},
					},
					handlePaste: (_view, event) => {
						const clipboardData = event.clipboardData
						if (!clipboardData) return false

						return pasteMessageClipboard(this.editor, clipboardData, {
							onMentionsInsert: this.options.onMentionsInsert,
							dataService: this.options.dataService ?? null,
							getWorkspaceFilesList: this.options.getWorkspaceFilesList,
						})
					},
				},
			}),
		]
	},
})

export default CopyMessageExtension
