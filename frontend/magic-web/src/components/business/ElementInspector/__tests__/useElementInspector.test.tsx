import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useElementInspector } from "../useElementInspector"
import { INSPECTOR_MSG } from "../types"

describe("useElementInspector", () => {
	it("keeps inspection active when a pointer starts on its overlay", () => {
		const iframe = document.createElement("iframe")
		document.body.appendChild(iframe)
		const iframeRef = { current: iframe }

		try {
			const { result } = renderHook(() => useElementInspector({ iframeRef }))
			render(<div data-element-inspector-overlay="true" data-testid="inspector-overlay" />)

			act(() => result.current.start())
			const overlay = screen.getByTestId("inspector-overlay")
			fireEvent.pointerDown(overlay)
			fireEvent.mouseDown(overlay)

			expect(result.current.active).toBe(true)

			fireEvent.mouseDown(document.body)
			expect(result.current.active).toBe(false)
		} finally {
			iframe.remove()
		}
	})

	it("keeps inspection active when a pointer starts on the portaled panel", () => {
		const iframe = document.createElement("iframe")
		document.body.appendChild(iframe)
		const iframeRef = { current: iframe }

		try {
			const { result } = renderHook(() => useElementInspector({ iframeRef }))
			render(
				<div
					data-element-inspector-panel-portal="true"
					data-testid="inspector-panel-portal"
				/>,
			)

			act(() => result.current.start())
			fireEvent.mouseDown(screen.getByTestId("inspector-panel-portal"))

			expect(result.current.active).toBe(true)
		} finally {
			iframe.remove()
		}
	})

	it("stops the iframe that was active when the hook unmounted", () => {
		const iframe = document.createElement("iframe")
		const replacement = document.createElement("iframe")
		document.body.append(iframe, replacement)
		const iframeRef = { current: iframe }
		const iframeWindow = iframe.contentWindow
		if (!iframeWindow) throw new Error("iframe contentWindow is unavailable")
		const postMessage = vi.spyOn(iframeWindow, "postMessage")

		try {
			const { result, unmount } = renderHook(() => useElementInspector({ iframeRef }))
			act(() => result.current.start())
			iframeRef.current = replacement

			unmount()

			expect(postMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: INSPECTOR_MSG.STOP }),
				"*",
			)
		} finally {
			iframe.remove()
			replacement.remove()
		}
	})
})
