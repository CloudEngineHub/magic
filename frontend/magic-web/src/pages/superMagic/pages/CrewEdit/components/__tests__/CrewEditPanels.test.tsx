import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import CrewEditPanels from "../CrewEditPanels"

class ResizeObserverMock {
	observe() {
		return undefined
	}
	disconnect() {
		return undefined
	}
}

function TestMessagePanel() {
	return <div>message</div>
}

describe("CrewEditPanels", () => {
	const originalClientWidth = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		"clientWidth",
	)

	beforeEach(() => {
		vi.stubGlobal("ResizeObserver", ResizeObserverMock)
		Object.defineProperty(HTMLElement.prototype, "clientWidth", {
			configurable: true,
			value: 1200,
		})
	})

	afterEach(() => {
		if (originalClientWidth) {
			Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth)
		}
		vi.unstubAllGlobals()
	})

	it("keeps the expanded message panel at its configured width instead of filling the remainder", async () => {
		render(
			<CrewEditPanels
				sidebar={<div>sidebar</div>}
				detailPanel={<div>detail</div>}
				messagePanel={<TestMessagePanel />}
				showDetailPanel
				sidebarWidthPx={320}
				messagePanelWidthPx={420}
			/>,
		)

		const messagePanel = await screen.findByTestId("crew-edit-message-panel")
		const detailPanel = screen.getByTestId("crew-edit-detail-panel")

		expect(messagePanel).toHaveStyle({
			width: "420px",
			minWidth: "420px",
			flexBasis: "420px",
		})
		expect(detailPanel).toHaveStyle({ width: "calc(100% - 428px)" })
	})
})
