import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useEffect, useState, type ComponentType } from "react"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router"
import { describe, expect, it, vi } from "vitest"
import Home from "../index.desktop"

const { homeMount, homeUnmount } = vi.hoisted(() => ({
	homeMount: vi.fn(),
	homeUnmount: vi.fn(),
}))
vi.mock("@/models/user", () => ({
	userStore: { user: { userInfo: { user_id: "user" }, organizationCode: "org" } },
}))
vi.mock("@/pages/superMagic/hooks/useFeaturedModeListRefresh", () => ({
	useFeaturedModeListRefreshOnAgentsPageMount: vi.fn(),
}))
vi.mock("../components/Header", () => ({ default: () => <div>workspace header</div> }))
vi.mock("../../ChatHomePage/components/ChatConversationSwitcher", () => ({
	default: () => <div>chat header</div>,
}))
vi.mock("../../ChatHomePage/components/ChatHomeEditor", () => ({
	default: function ChatEditor() {
		const [value, setValue] = useState("")
		return (
			<input
				aria-label="chat session"
				value={value}
				onChange={(e) => setValue(e.target.value)}
			/>
		)
	},
}))
vi.mock("../../../components/MainInputContainer", () => ({
	default: function Container({
		EditorComponent,
		editorSessionKey,
	}: {
		EditorComponent?: ComponentType
		editorSessionKey?: string
	}) {
		useEffect(() => {
			homeMount()
			return homeUnmount
		}, [])
		return (
			<div data-testid="persistent-home">
				{EditorComponent ? (
					<EditorComponent key={editorSessionKey} />
				) : (
					<input aria-label="task session" />
				)}
			</div>
		)
	},
}))

function Navigation() {
	const navigate = useNavigate()
	return (
		<>
			<button onClick={() => navigate("/global/super/chat")}>chat</button>
			<button onClick={() => navigate("/global/super/workspace/workspace-1")}>task</button>
			<button onClick={() => navigate(-1)}>back</button>
		</>
	)
}

describe("desktop creation home navigation", () => {
	it("preserves the home DOM across route changes while isolating editor sessions", async () => {
		render(
			<MemoryRouter initialEntries={["/global/super/workspace/workspace-1"]}>
				<Navigation />
				<Routes>
					<Route path="/:clusterCode/super/workspace/:workspaceId" element={<Home />} />
					<Route path="/:clusterCode/super/chat" element={<Home />} />
				</Routes>
			</MemoryRouter>,
		)
		const home = screen.getByTestId("persistent-home")
		fireEvent.click(screen.getByText("chat", { selector: "button" }))
		fireEvent.change(screen.getByLabelText("chat session"), {
			target: { value: "old session" },
		})
		expect(screen.getByText("chat header")).toBeInTheDocument()
		fireEvent.click(screen.getByText("task", { selector: "button" }))
		expect(screen.getByLabelText("task session")).toBeInTheDocument()
		expect(screen.queryByLabelText("chat session")).not.toBeInTheDocument()
		fireEvent.click(screen.getByText("back", { selector: "button" }))
		await waitFor(() => expect(screen.getByLabelText("chat session")).toHaveValue(""))
		expect(screen.getByTestId("persistent-home")).toBe(home)
		expect(homeMount).toHaveBeenCalledTimes(1)
		expect(homeUnmount).not.toHaveBeenCalled()
	})
})
