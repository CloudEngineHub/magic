import { describe, expect, it } from "vitest"
import { MessageStatus } from "@/pages/superMagic/pages/Workspace/types"
import { projectVisibleMessagesByRevokedTail } from "../project-visible-messages-by-revoked-tail"

interface MessageFixture {
	id: string
	status?: string
	role?: "user" | "assistant" | "tool"
	correlation_id?: string
	parent_correlation_id?: string
	debug?: { status?: string }
}

function createMessage(
	id: string,
	status = "read",
	options: Omit<MessageFixture, "id" | "status"> = {},
): MessageFixture {
	return { id, status, ...options }
}

function createTwoTurnAgentMessages({
	aUserStatus = "read",
	bUserStatus = "read",
	bAssistantStatus = "unread",
	bAssistantRuntimeStatus = "finished",
}: {
	aUserStatus?: string
	bUserStatus?: string
	bAssistantStatus?: string
	bAssistantRuntimeStatus?: string
} = {}): MessageFixture[] {
	return [
		createMessage("a-user", aUserStatus, { role: "user" }),
		createMessage("a-assistant", "unread", {
			role: "assistant",
			correlation_id: "a-correlation",
			debug: { status: "finished" },
		}),
		createMessage("a-tool-1", "read", {
			role: "tool",
			parent_correlation_id: "a-correlation",
		}),
		createMessage("a-tool-2", "read", {
			role: "tool",
			parent_correlation_id: "a-correlation",
		}),
		createMessage("b-user", bUserStatus, { role: "user" }),
		createMessage("b-assistant", bAssistantStatus, {
			role: "assistant",
			correlation_id: "b-correlation",
			debug: { status: bAssistantRuntimeStatus },
		}),
		createMessage("b-tool-1", "read", {
			role: "tool",
			parent_correlation_id: "b-correlation",
		}),
		createMessage("b-tool-2", "read", {
			role: "tool",
			parent_correlation_id: "b-correlation",
		}),
	]
}

describe("projectVisibleMessagesByRevokedTail", () => {
	it.each([
		{
			label: "历史撤回后已有普通消息",
			input: [createMessage("revoked-1", MessageStatus.REVOKED), createMessage("normal-2")],
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

	it("[REV-06] revoked User 锚点后的 running Assistant 和 read Tool 均属于当前撤回分支。", () => {
		const messages = createTwoTurnAgentMessages({
			bUserStatus: MessageStatus.REVOKED,
			bAssistantStatus: "unread",
			bAssistantRuntimeStatus: "running",
		})

		expect(projectVisibleMessagesByRevokedTail(messages).map((message) => message.id)).toEqual(
			messages.map((message) => message.id),
		)
	})

	it("[REV-07] 恢复后的 User 为 read 时不得因 Assistant 残留 revoked 而截断整轮。", () => {
		const messages = createTwoTurnAgentMessages({
			bUserStatus: "read",
			bAssistantStatus: MessageStatus.REVOKED,
		})

		expect(projectVisibleMessagesByRevokedTail(messages).map((message) => message.id)).toEqual(
			messages.map((message) => message.id),
		)
	})

	it("[REV-08] 历史 revoked User 分支必须连同其非 revoked Assistant 和 Tool 整体隐藏。", () => {
		const messages = createTwoTurnAgentMessages({
			aUserStatus: MessageStatus.REVOKED,
		})

		expect(projectVisibleMessagesByRevokedTail(messages).map((message) => message.id)).toEqual([
			"b-user",
			"b-assistant",
			"b-tool-1",
			"b-tool-2",
		])
	})
})
