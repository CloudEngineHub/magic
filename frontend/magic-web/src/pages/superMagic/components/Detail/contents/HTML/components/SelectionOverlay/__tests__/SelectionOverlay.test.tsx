import { act, render } from "@testing-library/react"
import type { ReactNode, RefObject } from "react"
import { describe, expect, it, vi } from "vitest"
import {
	StylePanelStoreProvider,
	useStylePanelStore,
} from "../../../iframe-bridge/contexts/StylePanelContext"
import type { StylePanelStore } from "../../../iframe-bridge/stores/StylePanelStore"
import { SelectionOverlay } from "../SelectionOverlay"

const useSelectionHandlesMock = vi.hoisted(() =>
	vi.fn(() => ({
		onHandleMouseDown: vi.fn(),
		resizeHandles: [],
		onRotateHandleMouseDown: vi.fn(),
		rotation: 0,
		onMoveHandleMouseDown: vi.fn(),
		isMoving: false,
		gapHandles: [],
		isGapDragging: false,
		onGapHandlePointerDown: vi.fn(),
		handleDelete: vi.fn(),
		handleDuplicate: vi.fn(),
		executeDelete: vi.fn(),
		executeDuplicate: vi.fn(),
	})),
)

vi.mock("../hooks/useSelectionHandles", () => ({
	useSelectionHandles: (options: { gapAxesLinked?: boolean }) => useSelectionHandlesMock(options),
}))

vi.mock("../hooks/useSelectionMessages", () => ({
	useSelectionMessages: vi.fn(),
}))

vi.mock("../hooks/useScrollSync", () => ({
	useScrollSync: () => ({ isScrolling: false }),
}))

vi.mock("../hooks/useScaleSync", () => ({
	useScaleSync: () => ({ isScaling: false }),
}))

function lastGapAxesLinked() {
	const calls = useSelectionHandlesMock.mock.calls
	return (calls[calls.length - 1]?.[0] as { gapAxesLinked?: boolean } | undefined)?.gapAxesLinked
}

function renderOverlay() {
	let store!: StylePanelStore
	const iframeRef = { current: null } as RefObject<HTMLIFrameElement>

	function CaptureStore({ children }: { children: ReactNode }) {
		store = useStylePanelStore()
		return children
	}

	render(
		<StylePanelStoreProvider>
			<CaptureStore>
				<SelectionOverlay iframeRef={iframeRef} disabled />
			</CaptureStore>
		</StylePanelStoreProvider>,
	)

	return store
}

describe("SelectionOverlay gap lock binding", () => {
	it("re-binds useSelectionHandles when gapAxesLinked changes", () => {
		const store = renderOverlay()

		expect(lastGapAxesLinked()).toBe(true)

		act(() => {
			store.setGapAxesLinked(false)
		})

		expect(lastGapAxesLinked()).toBe(false)
	})

	it("does not re-bind when only computed styles preview", () => {
		const store = renderOverlay()
		act(() => {
			store.selectElement({
				selector: ".layout",
				tagName: "div",
				computedStyles: {
					rowGap: "8px",
					columnGap: "8px",
					gap: "8px",
					width: "120px",
					height: "80px",
				},
			} as never)
		})

		const callsAfterSelect = useSelectionHandlesMock.mock.calls.length

		act(() => {
			store.updateComputedStyles({ width: "240px" })
		})

		expect(useSelectionHandlesMock.mock.calls.length).toBe(callsAfterSelect)
		expect(lastGapAxesLinked()).toBe(true)
	})
})
