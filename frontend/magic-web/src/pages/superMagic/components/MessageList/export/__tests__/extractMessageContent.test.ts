import { describe, expect, it } from "vitest"
import { extractTurns } from "../extractMessageContent"
import type { MessageTurnGroup } from "../../message-turn-groups"
import { SuperMagicMessageType, type SuperMagicMessageItem } from "../../type"

const FINISH_TASK_TOOL_ID = "938540548324491266"
const FINISH_TASK_LEGACY_TOOL_CALL_ID = "call_4d361d6c459b4a93b04767dd"

function createFinishTaskTurn(): MessageTurnGroup {
	const userNode = {
		role: "user",
		type: SuperMagicMessageType.RichText,
		app_message_id: "user-before-finish-task",
		content: "",
	} as SuperMagicMessageItem
	const finishTaskNode = {
		role: "tool",
		type: SuperMagicMessageType.ToolCall,
		app_message_id: "938540548324491265",
		task_id: "938538362815287296",
		tool_call_id: FINISH_TASK_LEGACY_TOOL_CALL_ID,
		attachments: [
			{
				display_filename: "business-impact.html",
				file_extension: "html",
				file_id: "938540442309406720",
				file_size: 4096,
				file_name: "business-impact.html",
				filename: "business-impact.html",
			},
		],
		tool: {
			id: FINISH_TASK_TOOL_ID,
			name: "finish_task",
			status: "finished",
			detail: {
				type: "html",
				data: {
					file_id: "938539108248047617",
					file_name: "index.html",
				},
			},
		},
	} as SuperMagicMessageItem

	return {
		key: "turn-user-before-finish-task",
		stickyItem: { node: userNode, index: 0 },
		items: [
			{ node: userNode, index: 0 },
			{ node: finishTaskNode, index: 1 },
		],
	}
}

describe("extractTurns finish_task projection", () => {
	it("keeps the task result attachment without exporting finish_task as an ordinary tool row", () => {
		const group = createFinishTaskTurn()
		const turns = extractTurns([group], new Set([group.key]), {
			includeToolCall: true,
		})

		expect(turns).toHaveLength(1)
		expect(turns[0].parts).toHaveLength(1)
		expect(turns[0].parts[0]).toMatchObject({
			role: "assistant",
			type: "attachment",
			attachments: [
				{
					name: "business-impact.html",
					size: 4096,
					extension: "html",
					file_extension: "html",
					kind: "file",
				},
			],
		})
		expect(turns[0].parts[0]).not.toHaveProperty("toolCallId")
		expect(turns[0].parts.some((part) => part.role === "tool")).toBe(false)
	})
})
