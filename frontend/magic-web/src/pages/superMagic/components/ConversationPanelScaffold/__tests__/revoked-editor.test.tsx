import type { ReactNode } from "react"
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { RevokedMessageEditorContext } from "@/pages/superMagic/components/MessageList/revoked-editor-context"
import ConversationPanelScaffold from ".."

const messageListMocks = vi.hoisted(() => ({
	enableRevokedUserMessageReedit: false,
	revokedEditorContext: undefined as RevokedMessageEditorContext | undefined,
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@/pages/superMagic/components/MessageList", () => ({
	default: ({
		enableRevokedUserMessageReedit,
		revokedEditorContext,
	}: {
		enableRevokedUserMessageReedit?: boolean
		revokedEditorContext?: RevokedMessageEditorContext
	}) => {
		messageListMocks.enableRevokedUserMessageReedit = Boolean(enableRevokedUserMessageReedit)
		messageListMocks.revokedEditorContext = revokedEditorContext
		return <div data-testid="message-list" />
	},
	MessageListProvider: ({ children }: { children: ReactNode }) => children,
}))

function EmptyState() {
	return <div />
}

describe("ConversationPanelScaffold revoked editor", () => {
	it("forwards the revoked editor capability and scoped context", () => {
		const revokedEditorContext = {
			selectedProject: { id: "micro-app-project" } as never,
			topicMode: "default" as never,
		}

		render(
			<ConversationPanelScaffold
				scope="test-conversation"
				emptyHero={<EmptyState />}
				emptyCompact={<div />}
				editor={<div />}
				messageListProviderValue={{} as never}
				messages={[{ id: "message-1", role: "user" }] as never}
				selectedTopic={{ id: "topic-1" } as never}
				enableRevokedUserMessageReedit
				revokedEditorContext={revokedEditorContext}
			/>,
		)

		expect(messageListMocks.enableRevokedUserMessageReedit).toBe(true)
		expect(messageListMocks.revokedEditorContext).toBe(revokedEditorContext)
	})
})
