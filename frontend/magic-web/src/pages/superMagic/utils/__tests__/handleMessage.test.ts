import { describe, expect, it } from "vitest"
import { MessageStatus } from "../../pages/Workspace/types"
import {
	filterClickableMessageWithoutRevoked,
	filterMessagesWithAttachments,
} from "../handleMessage"

const createToolNode = (status = "finished") => ({
	role: "assistant",
	status,
	content: "tool result",
	tool: {
		id: "tool-1",
		name: "read_file",
		detail: { data: { source_file_id: "file-1" } },
	},
	attachments: [{ key: "file-1" }],
})

describe("handleMessage IM/SuperMessage status boundary", () => {
	it("uses the outer IM status instead of node execution status for revoked click filtering", () => {
		const node = createToolNode("running")

		expect(
			filterClickableMessageWithoutRevoked(node, { imStatus: MessageStatus.REVOKED }),
		).toBe(false)
		expect(filterClickableMessageWithoutRevoked(node, { imStatus: "read" })).toBe(true)
	})

	it("uses the outer IM status instead of node execution status for attachment auto-open", () => {
		const node = createToolNode("finished")

		expect(filterMessagesWithAttachments(node, { imStatus: MessageStatus.REVOKED })).toBe(false)
		expect(filterMessagesWithAttachments(node, { imStatus: "read" })).toBe(true)
	})
})
