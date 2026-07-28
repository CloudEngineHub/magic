import { describe, expect, it } from "vitest"
import { MessageStatus } from "@/pages/superMagic/pages/Workspace/types"
import { projectVisibleMessagesByRevokedTail } from "../project-visible-messages-by-revoked-tail"

interface MessageFixture {
	id: string
	status?: string
}

function createMessage(id: string, status = "read"): MessageFixture {
	return { id, status }
}

describe("projectVisibleMessagesByRevokedTail", () => {
	it.each([
		{
			label: "历史撤回后已有普通消息",
			input: [
				createMessage("revoked-1", MessageStatus.REVOKED),
				createMessage("normal-2"),
			],
			expectedIds: ["normal-2"],
		},
		{
			label: "普通消息后存在当前连续撤回段",
			input: [
				createMessage("normal-1"),
				createMessage("revoked-2", MessageStatus.REVOKED),
				createMessage("revoked-3", MessageStatus.REVOKED),
			],
			expectedIds: ["normal-1", "revoked-2", "revoked-3"],
		},
		{
			label: "历史撤回和当前撤回段同时存在",
			input: [
				createMessage("revoked-1", MessageStatus.REVOKED),
				createMessage("normal-2"),
				createMessage("revoked-3", MessageStatus.REVOKED),
			],
			expectedIds: ["normal-2", "revoked-3"],
		},
	])("projects $label", ({ input, expectedIds }) => {
		const original = input.slice()

		expect(projectVisibleMessagesByRevokedTail(input).map((message) => message.id)).toEqual(
			expectedIds,
		)
		expect(input).toEqual(original)
	})

	it("keeps an all-revoked tail visible", () => {
		const messages = [
			createMessage("revoked-1", MessageStatus.REVOKED),
			createMessage("revoked-2", MessageStatus.REVOKED),
		]

		expect(projectVisibleMessagesByRevokedTail(messages)).toEqual(messages)
	})
})
