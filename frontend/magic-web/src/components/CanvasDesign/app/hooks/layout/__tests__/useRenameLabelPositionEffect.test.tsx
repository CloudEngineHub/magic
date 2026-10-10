import { act, cleanup, render } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import useRenameLabelPositionEffect from "../useRenameLabelPositionEffect"

const mocks = vi.hoisted(() => ({
	canvas: {
		container: document.createElement("div"),
		nameLabelManager: {
			getRenameInputLayout: vi.fn(() => ({
				x: 10,
				y: 20,
				width: 80,
				height: 12,
				text: "Image name",
				fontSize: 12,
				fontFamily: "Arial",
				color: "#737373",
			})),
		},
	},
	handlers: {} as Record<string, (...events: Array<{ data: unknown } | undefined>) => void>,
}))

vi.mock("../../../providers/CanvasProvider", () => ({
	useCanvas: () => ({ canvas: mocks.canvas }),
}))

vi.mock("../../canvas", () => ({
	useCanvasEvents: (
		events: readonly string[],
		handler: (...events: Array<{ data: unknown } | undefined>) => void,
	) => {
		events.forEach((eventName, index) => {
			mocks.handlers[eventName] = (event) => {
				const eventArgs = new Array(events.length).fill(undefined)
				eventArgs[index] = event
				handler(...eventArgs)
			}
		})
	},
}))

function createAnimationFrameHarness() {
	let nextFrameId = 0
	const callbacks = new Map<number, FrameRequestCallback>()
	const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
		nextFrameId += 1
		callbacks.set(nextFrameId, callback)
		return nextFrameId
	})
	const cancelAnimationFrame = vi.fn((frameId: number) => callbacks.delete(frameId))
	const flush = () => {
		const queued = Array.from(callbacks.values())
		callbacks.clear()
		queued.forEach((callback) => callback(0))
	}

	vi.stubGlobal("requestAnimationFrame", requestAnimationFrame)
	vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame)
	return { flush, requestAnimationFrame }
}

function Harness({ onTargetDeleted }: { onTargetDeleted: () => void }) {
	const inputRef = useRef<HTMLInputElement | null>(null)
	const { containerRef } = useRenameLabelPositionEffect({
		elementId: "image-1",
		inputRef,
		value: "Image name",
		onTargetDeleted,
	})
	return (
		<div ref={containerRef}>
			<input ref={inputRef} />
		</div>
	)
}

describe("useRenameLabelPositionEffect", () => {
	beforeEach(() => {
		mocks.handlers = {}
		mocks.canvas.nameLabelManager.getRenameInputLayout.mockClear()
	})

	afterEach(() => {
		cleanup()
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it("coalesces viewport events into one position measurement per frame", () => {
		const animationFrame = createAnimationFrameHarness()
		render(<Harness onTargetDeleted={vi.fn()} />)
		const initialCalls = mocks.canvas.nameLabelManager.getRenameInputLayout.mock.calls.length

		act(() => {
			mocks.handlers["viewport:scale"]?.({ data: { scale: 2 } })
			mocks.handlers["viewport:pan"]?.({ data: { x: 24, y: 12 } })
		})

		expect(animationFrame.requestAnimationFrame).toHaveBeenCalledTimes(1)
		expect(mocks.canvas.nameLabelManager.getRenameInputLayout).toHaveBeenCalledTimes(
			initialCalls,
		)

		act(() => animationFrame.flush())
		expect(mocks.canvas.nameLabelManager.getRenameInputLayout).toHaveBeenCalledTimes(
			initialCalls + 1,
		)
	})

	it("closes immediately when the renamed element is deleted", () => {
		createAnimationFrameHarness()
		const onTargetDeleted = vi.fn()
		render(<Harness onTargetDeleted={onTargetDeleted} />)

		act(() => {
			mocks.handlers["element:deleted"]?.({ data: { elementId: "image-1" } })
		})

		expect(onTargetDeleted).toHaveBeenCalledTimes(1)
	})
})
