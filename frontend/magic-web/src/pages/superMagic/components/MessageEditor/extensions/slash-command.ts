import type { Editor } from "@/infrastructure/editors/tiptap/core"
import { Plugin, PluginKey } from "@/infrastructure/editors/tiptap/pm-state"
import {
	Suggestion,
	exitSuggestion,
	type SuggestionProps,
} from "@/infrastructure/editors/tiptap/suggestion"
import { WECHAT_CHAT_HISTORY } from "./wechat-chat-history/types"

interface CommandItem {
	id: "wechat-chat-history"
}
export interface SlashMenuState {
	query: string
	rect: DOMRect
	choose: () => void
}
export const matchesWechatCommand = (query: string) =>
	["微信聊天记录", "wechat", "chat", "wx"].some((name) =>
		name.includes(query.trim().toLowerCase()),
	)

export function installWechatSlashCommand(
	editor: Editor,
	onMenu: (menu: SlashMenuState | null) => void,
	onChoose: () => void,
) {
	const key = new PluginKey("wechatSlashCommand")
	const inputKey = new PluginKey("wechatSlashInput")
	let inputFrom = -1
	let current: SuggestionProps<CommandItem> | null = null
	const publish = (props: SuggestionProps<CommandItem>) => {
		current = props
		const rect = props.clientRect?.()
		if (rect)
			onMenu({
				query: props.query,
				rect,
				choose: () => props.command({ id: "wechat-chat-history" }),
			})
	}
	// @ 插件与 slash 各自拥有输入记录和 PluginKey；paste/程序恢复不激活动作菜单。
	editor.registerPlugin(
		new Plugin({
			key: inputKey,
			props: {
				handleTextInput(_view, from, _to, text) {
					if (text === "/") inputFrom = from
					return false
				},
			},
		}),
	)
	editor.registerPlugin(
		Suggestion<CommandItem>({
			editor,
			pluginKey: key,
			char: "/",
			allowSpaces: false,
			allowedPrefixes: [" ", "\n", "\t"],
			allow: ({ state, range }) => {
				if (range.from !== inputFrom || !editor.isEditable) return false
				const position = state.doc.resolve(range.from)
				for (let depth = position.depth; depth > 0; depth--) {
					if (
						position.node(depth).type.name === WECHAT_CHAT_HISTORY ||
						position.node(depth).type.spec.code
					)
						return false
				}
				return true
			},
			items: ({ query }) =>
				matchesWechatCommand(query) ? [{ id: "wechat-chat-history" }] : [],
			command: ({ editor: instance, range }) => {
				instance.chain().deleteRange(range).run()
				onChoose()
			},
			render: () => ({
				onStart: publish,
				onUpdate: publish,
				onExit: () => {
					current = null
					inputFrom = -1
					onMenu(null)
				},
			}),
		}),
	)
	return {
		dismiss() {
			exitSuggestion(editor.view, key)
		},
		handleKeyDown(event: KeyboardEvent): boolean {
			if (!current) return false
			if (event.isComposing) return false
			if (event.key === "Escape") {
				exitSuggestion(editor.view, key)
				return true
			}
			if (event.key === "Enter") {
				if (matchesWechatCommand(current.query))
					current.command({ id: "wechat-chat-history" })
				return true
			}
			return event.key === "ArrowDown" || event.key === "ArrowUp"
		},
		dispose() {
			current = null
			onMenu(null)
			if (!editor.isDestroyed) {
				editor.unregisterPlugin(inputKey)
				editor.unregisterPlugin(key)
			}
		},
	}
}
