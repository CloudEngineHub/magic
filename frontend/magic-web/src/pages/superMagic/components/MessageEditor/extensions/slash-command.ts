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
	anchor?: HTMLElement
	onQueryChange?: (query: string) => void
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
	let buttonMenu: { anchor: HTMLElement; query: string } | null = null
	const dismiss = (restoreFocus = false) => {
		const wasButtonMenu = buttonMenu !== null
		buttonMenu = null
		onMenu(null)
		if (!editor.isDestroyed) exitSuggestion(editor.view, key)
		if (restoreFocus && wasButtonMenu && !editor.isDestroyed) editor.commands.focus()
	}
	const publishButtonMenu = () => {
		if (!buttonMenu) return
		onMenu({
			query: buttonMenu.query,
			rect: buttonMenu.anchor.getBoundingClientRect(),
			anchor: buttonMenu.anchor,
			choose: () => {
				if (!buttonMenu) return
				dismiss()
				onChoose()
			},
			onQueryChange: (query) => {
				if (!buttonMenu) return
				buttonMenu.query = query
				publishButtonMenu()
			},
		})
	}
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
		open(anchor: HTMLElement) {
			if (!editor.isEditable || editor.isDestroyed) return
			// 按钮复用同一菜单，但搜索不写入正文；仅键盘 / 入口需要删除触发范围。
			dismiss()
			buttonMenu = { anchor, query: "" }
			publishButtonMenu()
		},
		dismiss,
		handleKeyDown(event: KeyboardEvent): boolean {
			if (!current && !buttonMenu) return false
			if (event.isComposing) return false
			if (event.key === "Escape") {
				dismiss(true)
				return true
			}
			if (event.key === "Enter") {
				if (current && matchesWechatCommand(current.query))
					current.command({ id: "wechat-chat-history" })
				else if (buttonMenu && matchesWechatCommand(buttonMenu.query)) {
					dismiss()
					onChoose()
				}
				return true
			}
			return event.key === "ArrowDown" || event.key === "ArrowUp"
		},
		dispose() {
			current = null
			buttonMenu = null
			onMenu(null)
			if (!editor.isDestroyed) {
				editor.unregisterPlugin(inputKey)
				editor.unregisterPlugin(key)
			}
		},
	}
}
