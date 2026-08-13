import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import {
	MessageViewStateProvider,
	MessageViewStateScopeProvider,
	useMessageViewState,
} from "../MessageViewStateContext"

function StatefulRow() {
	const [expanded, setExpanded] = useMessageViewState("reasoning-expanded", false)
	return (
		<button type="button" onClick={() => setExpanded((value) => !value)}>
			{expanded ? "expanded" : "collapsed"}
		</button>
	)
}

function Harness() {
	const [mounted, setMounted] = useState(true)
	return (
		<MessageViewStateProvider topicKey="topic-1">
			<button type="button" onClick={() => setMounted((value) => !value)}>
				toggle-row
			</button>
			{mounted ? (
				<MessageViewStateScopeProvider messageKey="message-1">
					<StatefulRow />
				</MessageViewStateScopeProvider>
			) : null}
		</MessageViewStateProvider>
	)
}

describe("MessageViewStateContext", () => {
	it("restores semantic interaction state after a virtual row unmounts and remounts", () => {
		render(<Harness />)

		fireEvent.click(screen.getByRole("button", { name: "collapsed" }))
		expect(screen.getByRole("button", { name: "expanded" })).toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "toggle-row" }))
		expect(screen.queryByRole("button", { name: "expanded" })).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "toggle-row" }))
		expect(screen.getByRole("button", { name: "expanded" })).toBeInTheDocument()
	})

	it("isolates the same control key by topic and message identity", () => {
		const { rerender } = render(
			<MessageViewStateProvider topicKey="topic-1">
				<MessageViewStateScopeProvider messageKey="message-1">
					<StatefulRow />
				</MessageViewStateScopeProvider>
			</MessageViewStateProvider>,
		)
		fireEvent.click(screen.getByRole("button", { name: "collapsed" }))

		rerender(
			<MessageViewStateProvider topicKey="topic-1">
				<MessageViewStateScopeProvider messageKey="message-2">
					<StatefulRow />
				</MessageViewStateScopeProvider>
			</MessageViewStateProvider>,
		)
		expect(screen.getByRole("button", { name: "collapsed" })).toBeInTheDocument()
	})
})
