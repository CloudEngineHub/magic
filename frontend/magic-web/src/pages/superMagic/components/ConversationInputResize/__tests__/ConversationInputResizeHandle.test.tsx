import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ConversationInputResizeHandle from "../ConversationInputResizeHandle"

describe("ConversationInputResizeHandle", () => {
	let frameCallbacks: FrameRequestCallback[]

	beforeEach(() => {
		frameCallbacks = []
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			frameCallbacks.push(callback)
			return frameCallbacks.length
		})
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	/** Run the next queued frame to simulate the browser's paint cadence. */
	function flushNextFrame() {
		const callback = frameCallbacks.shift()
		if (!callback) return
		act(() => callback(performance.now()))
	}

	it("coalesces rapid mouse movement into one resize update per frame", () => {
		const onResize = vi.fn()
		const onResizeStateChange = vi.fn()
		render(
			<ConversationInputResizeHandle
				value={240}
				min={200}
				max={560}
				onResizeStart={vi.fn()}
				onResize={onResize}
				onResizeEnd={vi.fn()}
				onDoubleClick={vi.fn()}
				onResizeStateChange={onResizeStateChange}
			/>,
		)

		const handle = screen.getByTestId("conversation-input-resize-handle")
		fireEvent.mouseDown(handle, { button: 0, clientY: 100 })
		fireEvent.mouseMove(window, { clientY: 92 })
		fireEvent.mouseMove(window, { clientY: 76 })

		expect(onResize).not.toHaveBeenCalled()
		flushNextFrame()
		expect(onResize).toHaveBeenCalledTimes(1)
		expect(onResize).toHaveBeenLastCalledWith(-24)

		fireEvent.mouseUp(window, { button: 0, clientY: 76 })
		expect(onResizeStateChange).toHaveBeenNthCalledWith(1, true)
		expect(onResizeStateChange).toHaveBeenLastCalledWith(false)
	})

	it("flushes the latest pending movement before ending the resize", () => {
		const onResize = vi.fn()
		const onResizeEnd = vi.fn()
		render(
			<ConversationInputResizeHandle
				value={240}
				min={200}
				max={560}
				onResizeStart={vi.fn()}
				onResize={onResize}
				onResizeEnd={onResizeEnd}
				onDoubleClick={vi.fn()}
			/>,
		)

		const handle = screen.getByTestId("conversation-input-resize-handle")
		fireEvent.mouseDown(handle, { button: 0, clientY: 100 })
		fireEvent.mouseMove(window, { clientY: 68 })
		fireEvent.mouseUp(window, { button: 0, clientY: 68 })

		expect(onResize).toHaveBeenCalledWith(-32)
		expect(onResizeEnd).toHaveBeenCalledTimes(1)
	})
})
