import { isRenderableToolCall } from "./components/Nodes/MessageNode/tool-call/types"
import { TaskStatus } from "../../pages/Workspace/types"
import type { SuperMagicMessageItem } from "./type"
import type { VirtualMessageItem, VirtualMessageRowItem } from "./virtual-message-items"

export interface ProcessNode {
	role?: string
	task_id?: string
	content?: string
	reasoning_content?: string
	tool_calls?: unknown[]
	status?: string
	tool?: { name?: string; status?: string }
}
export interface MessageProcessGroup {
	key: string
	answerIndex: number
	processIndices: ReadonlySet<number>
}

/**
 * 成功的 finish_task 是折叠边界，用户消息不是任务边界（Ask User 可跨多条用户消息）。
 * 缺少开头、task_id、最终正文或仍在逐字显示时保留全文，不能把阶段性回复当作交付。
 */
export function buildMessageProcessGroups(
	messages: ReadonlyArray<SuperMagicMessageItem>,
	resolveNode: (message: SuperMagicMessageItem) => ProcessNode,
	isRendering: (message: SuperMagicMessageItem) => boolean,
	visibleSourceIndices: ReadonlySet<number>,
): MessageProcessGroup[] {
	const tasks = new Map<string, { indices: number[]; hasUser: boolean }>()
	let previousUserIndex = -1
	messages.forEach((message, index) => {
		if (message.role === "user") previousUserIndex = index
		const node = resolveNode(message)
		if (!node.task_id) return
		let task = tasks.get(node.task_id)
		if (!task) {
			task = { indices: [], hasUser: previousUserIndex >= 0 }
			tasks.set(node.task_id, task)
		}
		task.indices.push(index)
	})
	const groups: MessageProcessGroup[] = []
	for (const [taskId, task] of tasks) {
		if (!task.hasUser) continue
		const finishIndex = task.indices[task.indices.length - 1]
		const finish = resolveNode(messages[finishIndex])
		if (
			finish.role !== "tool" ||
			finish.tool?.name !== "finish_task" ||
			finish.tool.status !== TaskStatus.FINISHED
		)
			continue
		if (
			task.indices.some((index) => {
				const node = resolveNode(messages[index])
				return (
					(index !== finishIndex && node.tool?.name === "finish_task") ||
					node.status === TaskStatus.ERROR ||
					node.status === TaskStatus.SUSPENDED ||
					isRendering(messages[index])
				)
			})
		)
			continue
		const answerIndex = [...task.indices]
			.reverse()
			.find((index) => resolveNode(messages[index]).role === "assistant")
		if (answerIndex === undefined || !resolveNode(messages[answerIndex]).content?.trim())
			continue
		const processIndices = new Set(
			task.indices.filter((index) => {
				const node = resolveNode(messages[index])
				if (
					!visibleSourceIndices.has(index) ||
					index === finishIndex ||
					node.role === "user"
				)
					return false
				if (index === answerIndex)
					return Boolean(
						node.reasoning_content?.trim() ||
						node.tool_calls?.some(
							(call) =>
								isRenderableToolCall(call) &&
								call.function.name !== "run_sdk_snippet",
						),
					)
				return node.role === "assistant" || node.role === "tool"
			}),
		)
		if (!processIndices.size) continue
		groups.push({
			key: `${taskId}:${String(messages[finishIndex].super_message_id || messages[finishIndex].app_message_id)}`,
			answerIndex,
			processIndices,
		})
	}
	return groups
}

/** 原始 sourceIndex 和正文状态标识不变；展开的过程仍是一条消息一个虚拟行。 */
export function projectMessageProcesses(
	items: ReadonlyArray<VirtualMessageRowItem>,
	groups: ReadonlyArray<MessageProcessGroup>,
	isExpanded: (key: string) => boolean,
	messages: ReadonlyArray<SuperMagicMessageItem>,
): VirtualMessageItem[] {
	const membership = new Map<number, MessageProcessGroup>()
	for (const group of groups) {
		for (const index of group.processIndices) membership.set(index, group)
		membership.set(group.answerIndex, group)
	}
	const inserted = new Set<string>()
	const result: VirtualMessageItem[] = []
	for (const item of items) {
		const group = membership.get(item.sourceIndex)
		if (!group) {
			result.push(item)
			continue
		}
		const expanded = isExpanded(group.key)
		const isFirstProcessRow = !inserted.has(group.key)
		if (!inserted.has(group.key)) {
			inserted.add(group.key)
			const showHeader = messages[item.sourceIndex - 1]?.role === "user"
			result.push({
				kind: "process-toggle",
				key: `process:${group.key}`,
				groupKey: group.key,
				index: result.length,
				sourceIndex: item.sourceIndex,
				turnKey: item.turnKey,
				count: group.processIndices.size,
				expanded,
				showHeader,
				sendTime: typeof item.node.send_time === "number" ? item.node.send_time : undefined,
				role: "assistant",
				isUser: false,
				isTool: false,
				stickyCandidate: false,
				renderMode: "message",
				exportSelectable: false,
			})
		}
		if (item.sourceIndex === group.answerIndex) {
			if (expanded && group.processIndices.has(item.sourceIndex))
				result.push({
					...item,
					key: `${item.key}:process`,
					viewStateKey: item.key,
					contentMode: "process",
					suppressHeader: isFirstProcessRow,
				})
			result.push({ ...item, contentMode: "answer", suppressHeader: isFirstProcessRow })
		} else if (expanded) {
			result.push({ ...item, suppressHeader: isFirstProcessRow })
		}
	}
	return result.map((item, index) => (item.index === index ? item : { ...item, index }))
}
