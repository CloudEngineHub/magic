import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { buildMessageKeysAndTurnGroups } from "../message-turn-groups"
import { MessageTurnGroupList } from "../MessageTurnGroupList"
import type { SuperMagicMessageItem } from "../type"

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		getMessageNode: () => ({ status: "completed" }),
	},
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => (key === "messageRenderError.title" ? "这条消息暂时无法显示" : key),
		}),
	}
})

function msg(role: "user" | "assistant", appId: string): SuperMagicMessageItem {
	return { role, app_message_id: appId } as unknown as SuperMagicMessageItem
}

/** Minimal renderNode for turn-group list tests */
function renderNodeLabel({ node }: { node: SuperMagicMessageItem; index: number }) {
	return <span data-testid={`msg-${node.app_message_id}`}>{node.app_message_id}</span>
}

function ThrowingMessage(): JSX.Element {
	throw new Error("message render failed")
}

describe("MessageTurnGroupList", () => {
	const messages = [msg("user", "u1"), msg("assistant", "a1")]
	const { messageTurnGroups } = buildMessageKeysAndTurnGroups(messages)

	it("keeps the User sticky wrapper on mobile with the 10px offset", () => {
		const { container } = render(
			<MessageTurnGroupList
				groups={messageTurnGroups}
				isMobile
				renderNode={renderNodeLabel}
			/>,
		)

		expect(container.querySelector('[data-sticky-message-id="u1"]')).toHaveClass(
			"sticky",
			"top-[10px]",
		)
		expect(container.querySelector('[data-testid="msg-u1"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="msg-a1"]')).not.toBeNull()
	})

	it("keeps sticky wrapper on desktop for user turns", () => {
		const { container } = render(
			<MessageTurnGroupList
				groups={messageTurnGroups}
				isMobile={false}
				renderNode={renderNodeLabel}
			/>,
		)

		expect(container.querySelector('[data-sticky-message-id="u1"]')).not.toBeNull()
		expect(container.querySelector(".sticky")).not.toBeNull()
	})

	it("keeps other messages rendered when one message throws", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
		try {
			const { container } = render(
				<MessageTurnGroupList
					groups={messageTurnGroups}
					isMobile
					renderNode={({ node, index }) =>
						node.app_message_id === "a1" ? (
							<ThrowingMessage />
						) : (
							renderNodeLabel({ node, index })
						)
					}
				/>,
			)

			expect(container.querySelector('[data-testid="msg-u1"]')).not.toBeNull()
			expect(container.querySelector('[data-testid="message-render-error"]')).not.toBeNull()
			expect(container.querySelector('[data-message-id="a1"]')).not.toBeNull()
			expect(container).toHaveTextContent("这条消息暂时无法显示")
		} finally {
			consoleError.mockRestore()
		}
	})

	it("keeps other messages rendered when the render callback throws", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
		try {
			const { container } = render(
				<MessageTurnGroupList
					groups={messageTurnGroups}
					isMobile
					renderNode={({ node, index }) => {
						if (node.app_message_id === "a1") throw new Error("render callback failed")
						return renderNodeLabel({ node, index })
					}}
				/>,
			)

			expect(container.querySelector('[data-testid="msg-u1"]')).not.toBeNull()
			expect(container.querySelector('[data-testid="message-render-error"]')).not.toBeNull()
			expect(container.querySelector('[data-message-id="a1"]')).not.toBeNull()
		} finally {
			consoleError.mockRestore()
		}
	})

	it.each([
		["null", null],
		["false", false],
	])("does not render an empty message row when renderNode returns %s", (_, emptyNode) => {
		const { container } = render(
			<MessageTurnGroupList
				groups={messageTurnGroups}
				isMobile
				renderNode={({ node, index }) =>
					node.app_message_id === "a1" ? emptyNode : renderNodeLabel({ node, index })
				}
			/>,
		)

		expect(container.querySelector('[data-message-id="u1"]')).not.toBeNull()
		expect(container.querySelector('[data-message-id="a1"]')).toBeNull()
	})
})
