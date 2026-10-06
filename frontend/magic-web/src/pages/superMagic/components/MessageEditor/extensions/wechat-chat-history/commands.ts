import type { Editor, JSONContent } from "@/infrastructure/editors/tiptap/core"
import type { Node } from "@/infrastructure/editors/tiptap/pm-model"
import { WECHAT_CHAT_HISTORY } from "./types"
import { createWechatChat } from "./transform"
import { isWechatInstruction } from "./parser"

export function findWechatChat(
	editor: Editor,
	id: string,
): { node: Node; position: number } | null {
	let found: { node: Node; position: number } | null = null
	editor.state.doc.forEach((node, position) => {
		if (node.type.name === WECHAT_CHAT_HISTORY && node.attrs.id === id)
			found = { node, position }
	})
	return found
}

export function insertWechatChat(
	editor: Editor,
	range: { from: number; to: number },
	nodes: JSONContent[],
	placeholder: string,
): string | null {
	const resolved = editor.state.doc.resolve(range.from)
	for (let depth = resolved.depth; depth > 0; depth--) {
		const node = resolved.node(depth)
		if (node.type.name !== WECHAT_CHAT_HISTORY) continue
		const last = node.lastChild
		if (last && isWechatInstruction(last.toJSON())) {
			const instructionStart = resolved.before(depth) + node.nodeSize - last.nodeSize - 1
			// 在局部要求中继续粘贴聊天时追加到来源区；不能覆盖已写的处理要求。
			if (range.from > instructionStart)
				return editor.commands.insertContentAt(instructionStart, nodes)
					? (node.attrs.id as string)
					: null
		}
		return editor.commands.insertContentAt(range, nodes) ? (node.attrs.id as string) : null
	}
	const block = createWechatChat(nodes, placeholder)
	return editor.commands.insertContentAt(range, [block, { type: "paragraph" }])
		? (block.attrs?.id as string)
		: null
}
