import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type {
	InspectedElementInfo,
	useElementInspector,
} from "@/components/business/ElementInspector"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { useInspectorToolbarMode } from "../useInspectorToolbarMode"

const { modalConfirm } = vi.hoisted(() => ({ modalConfirm: vi.fn() }))

vi.mock("@/components/base/MagicModal", () => ({
	default: { confirm: modalConfirm },
}))

function createInfo(): InspectedElementInfo {
	return {
		selector: "#hero",
		tagName: "section",
		id: "hero",
		classList: ["hero"],
		rect: { top: 10, left: 20, width: 300, height: 120 },
		margin: { top: 0, right: 0, bottom: 0, left: 0 },
		padding: { top: 8, right: 8, bottom: 8, left: 8 },
		border: { top: 0, right: 0, bottom: 0, left: 0 },
		computedStyles: {},
		attributes: {},
		textContent: "Hero content",
	}
}

describe("useInspectorToolbarMode", () => {
	it("keeps typed instructions when the inspector object changes identity", () => {
		const selectedElement = createInfo()
		const fileInfo = {
			fileId: "file-1",
			fileName: "index.html",
			filePath: "index.html",
		}
		const inspector = {
			active: false,
			toggle: vi.fn(),
			start: vi.fn(),
			stop: vi.fn(),
			hoveredElement: null,
			selectedElement: null,
			clearSelection: vi.fn(),
			setTrackedSelectors: vi.fn(),
			trackedRects: {},
		} as unknown as ReturnType<typeof useElementInspector>
		const translate = (key: string) => key

		const { result, rerender } = renderHook(
			({ currentInspector }) =>
				useInspectorToolbarMode(currentInspector, translate, fileInfo),
			{ initialProps: { currentInspector: inspector } },
		)

		act(() => {
			result.current.startInAppendMode()
		})
		;(inspector as { selectedElement: InspectedElementInfo | null }).selectedElement =
			selectedElement
		rerender({ currentInspector: { ...inspector } })
		expect(result.current.activeTarget?.info.selector).toBe(selectedElement.selector)
		act(() =>
			result.current.attachElementScreenshot(selectedElement.selector, {
				dataUrl: "data:image/png;base64,shot",
				rect: selectedElement.rect,
			}),
		)
		expect(result.current.activeTarget?.screenshot?.dataUrl).toBe("data:image/png;base64,shot")

		act(() => {
			result.current.setDraftInstruction("Move this section lower")
		})
		;(inspector as { selectedElement: InspectedElementInfo | null }).selectedElement = {
			...selectedElement,
			rect: { ...selectedElement.rect, top: 240 },
		}
		rerender({ currentInspector: { ...inspector } })

		expect(result.current.draftInstruction).toBe("Move this section lower")
		expect(result.current.activeTarget?.info.rect.top).toBe(10)
	})

	it("keeps the selected element until the draft is confirmed", () => {
		const selectedElement = createInfo()
		const fileInfo = {
			fileId: "file-1",
			fileName: "index.html",
			filePath: "index.html",
		}
		const translate = (key: string) => key
		const inspector = {
			active: false,
			toggle: vi.fn(),
			start: vi.fn(),
			stop: vi.fn(),
			hoveredElement: null,
			selectedElement: null,
			clearSelection: vi.fn(),
			setTrackedSelectors: vi.fn(),
			trackedRects: {},
		} as unknown as ReturnType<typeof useElementInspector>
		vi.mocked(inspector.start).mockImplementation(() => {
			;(inspector as { selectedElement: InspectedElementInfo | null }).selectedElement = null
		})

		const { result, rerender } = renderHook(
			({ currentInspector, fileInfo }) =>
				useInspectorToolbarMode(currentInspector, translate, fileInfo),
			{
				initialProps: {
					currentInspector: inspector,
					fileInfo,
				},
			},
		)

		act(() => {
			result.current.startInAppendMode()
		})
		expect(result.current.isAppendPicking).toBe(true)
		expect(inspector.start).toHaveBeenCalledTimes(1)
		;(inspector as { selectedElement: InspectedElementInfo | null }).selectedElement =
			selectedElement
		rerender({ currentInspector: inspector, fileInfo })

		expect(result.current.activeTarget?.kind).toBe("element")
		expect(inspector.clearSelection).not.toHaveBeenCalled()

		act(() => {
			result.current.setDraftInstruction("Make the heading larger")
		})
		act(() => {
			result.current.confirmTarget()
		})

		expect(inspector.clearSelection).toHaveBeenCalledTimes(1)
		expect(result.current.activeTarget).toBeNull()
		expect(result.current.pendingTargets).toHaveLength(1)
	})

	it("clears a previous element selection before entering screenshot mode", () => {
		const fileInfo = {
			fileId: "file-1",
			fileName: "index.html",
			filePath: "index.html",
		}
		const inspector = {
			active: false,
			toggle: vi.fn(),
			start: vi.fn(),
			stop: vi.fn(),
			hoveredElement: null,
			selectedElement: createInfo(),
			clearSelection: vi.fn(),
			setTrackedSelectors: vi.fn(),
			trackedRects: {},
		} as unknown as ReturnType<typeof useElementInspector>
		const translate = (key: string) => key
		const { result } = renderHook(() => useInspectorToolbarMode(inspector, translate, fileInfo))

		act(() => result.current.startInAppendMode())
		act(() => result.current.updateSelectionMode("screenshot"))

		expect(inspector.clearSelection).toHaveBeenCalled()
	})

	it("restores the previous instruction when selecting a confirmed element again", () => {
		const selectedElement = createInfo()
		const fileInfo = {
			fileId: "file-1",
			fileName: "index.html",
			filePath: "index.html",
		}
		const translate = (key: string) => key
		const inspector = {
			active: false,
			toggle: vi.fn(),
			start: vi.fn(),
			stop: vi.fn(),
			hoveredElement: null,
			selectedElement: null,
			clearSelection: vi.fn(),
			setTrackedSelectors: vi.fn(),
			trackedRects: {},
		} as unknown as ReturnType<typeof useElementInspector>
		vi.mocked(inspector.start).mockImplementation(() => {
			;(inspector as { selectedElement: InspectedElementInfo | null }).selectedElement = null
		})

		const { result, rerender } = renderHook(() =>
			useInspectorToolbarMode(inspector, translate, fileInfo),
		)

		act(() => result.current.startInAppendMode())
		;(inspector as { selectedElement: InspectedElementInfo | null }).selectedElement =
			selectedElement
		rerender()
		act(() => result.current.setDraftInstruction("Make the heading larger"))
		act(() => result.current.confirmTarget())
		rerender()

		expect(result.current.pendingTargets[0]?.instruction).toBe("Make the heading larger")
		expect(result.current.activeTarget).toBeNull()
		;(inspector as { selectedElement: InspectedElementInfo | null }).selectedElement =
			selectedElement
		rerender()

		expect(result.current.activeTarget?.info.selector).toBe(selectedElement.selector)
		expect(result.current.draftInstruction).toBe("Make the heading larger")
	})

	it("exits AI selection mode when Escape is pressed", () => {
		const fileInfo = {
			fileId: "file-1",
			fileName: "index.html",
			filePath: "index.html",
		}
		const inspector = {
			active: false,
			toggle: vi.fn(),
			start: vi.fn(),
			stop: vi.fn(),
			hoveredElement: null,
			selectedElement: null,
			clearSelection: vi.fn(),
			setTrackedSelectors: vi.fn(),
			trackedRects: {},
		} as unknown as ReturnType<typeof useElementInspector>
		const translate = (key: string) => key
		const { result } = renderHook(() => useInspectorToolbarMode(inspector, translate, fileInfo))

		act(() => {
			result.current.startInAppendMode()
		})
		expect(result.current.isAppendPicking).toBe(true)

		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
		})

		expect(result.current.isAppendPicking).toBe(false)
		expect(result.current.pendingTargets).toHaveLength(0)
		expect(inspector.stop).toHaveBeenCalled()
	})

	it("clears the selected element when Escape exits AI selection", () => {
		const selectedElement = createInfo()
		const fileInfo = {
			fileId: "file-1",
			fileName: "index.html",
			filePath: "index.html",
		}
		const inspector = {
			active: false,
			toggle: vi.fn(),
			start: vi.fn(),
			stop: vi.fn(),
			hoveredElement: null,
			selectedElement: null,
			clearSelection: vi.fn(),
			setTrackedSelectors: vi.fn(),
			trackedRects: {},
		} as unknown as ReturnType<typeof useElementInspector>
		const translate = (key: string) => key
		const { result, rerender } = renderHook(() =>
			useInspectorToolbarMode(inspector, translate, fileInfo),
		)

		act(() => result.current.startInAppendMode())
		;(inspector as { selectedElement: InspectedElementInfo | null }).selectedElement =
			selectedElement
		rerender()

		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
		})

		expect(result.current.isAppendPicking).toBe(false)
		expect(inspector.clearSelection).toHaveBeenCalledOnce()
	})

	it("asks for confirmation before clearing pending targets on Escape", () => {
		modalConfirm.mockReset()
		modalConfirm.mockReturnValue({ destroy: vi.fn() })
		const selectedElement = createInfo()
		const fileInfo = {
			fileId: "file-1",
			fileName: "index.html",
			filePath: "index.html",
		}
		const inspector = {
			active: false,
			toggle: vi.fn(),
			start: vi.fn(),
			stop: vi.fn(),
			hoveredElement: null,
			selectedElement: null,
			clearSelection: vi.fn(),
			setTrackedSelectors: vi.fn(),
			trackedRects: {},
		} as unknown as ReturnType<typeof useElementInspector>
		vi.mocked(inspector.start).mockImplementation(() => {
			;(inspector as { selectedElement: InspectedElementInfo | null }).selectedElement = null
		})
		const translate = (key: string) => key
		const { result, rerender } = renderHook(() =>
			useInspectorToolbarMode(inspector, translate, fileInfo),
		)

		act(() => result.current.startInAppendMode())
		;(inspector as { selectedElement: InspectedElementInfo | null }).selectedElement =
			selectedElement
		rerender()
		act(() => result.current.setDraftInstruction("Update the section"))
		act(() => result.current.confirmTarget())
		rerender()

		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
		})

		expect(modalConfirm).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "stylePanel.inspector.exitConfirmTitle",
				content: "stylePanel.inspector.exitConfirmContent",
			}),
		)
		expect(result.current.isAppendPicking).toBe(true)
		expect(result.current.pendingTargets).toHaveLength(1)

		const modalConfig = modalConfirm.mock.calls[0]?.[0]
		act(() => modalConfig.onOk())
		expect(result.current.isAppendPicking).toBe(false)
		expect(result.current.pendingTargets).toHaveLength(0)
	})

	it("clears the selection flow after a successful submission", async () => {
		const selectedElement = createInfo()
		const fileInfo = {
			fileId: "file-1",
			fileName: "index.html",
			filePath: "index.html",
		}
		const translate = (key: string) => key
		const inspector = {
			active: false,
			toggle: vi.fn(),
			start: vi.fn(),
			stop: vi.fn(),
			hoveredElement: null,
			selectedElement: null,
			clearSelection: vi.fn(),
			setTrackedSelectors: vi.fn(),
			trackedRects: {},
		} as unknown as ReturnType<typeof useElementInspector>
		vi.mocked(inspector.start).mockImplementation(() => {
			;(inspector as { selectedElement: InspectedElementInfo | null }).selectedElement = null
		})

		const { result, rerender } = renderHook(
			({ currentInspector, fileInfo: currentFileInfo }) =>
				useInspectorToolbarMode(currentInspector, translate, currentFileInfo),
			{
				initialProps: {
					currentInspector: inspector,
					fileInfo,
				},
			},
		)

		act(() => {
			result.current.startInAppendMode()
		})
		;(inspector as { selectedElement: InspectedElementInfo | null }).selectedElement =
			selectedElement
		rerender({ currentInspector: inspector, fileInfo })
		act(() => {
			result.current.setDraftInstruction("Make the heading larger")
		})
		act(() => {
			result.current.confirmTarget()
		})
		rerender({ currentInspector: inspector, fileInfo })

		let submittedRequest: { onSuccess?: () => void } | undefined
		const submitListener = vi.fn((request: { onSuccess?: () => void }) => {
			submittedRequest = request
		})
		pubsub.subscribe(PubSubEvents.Submit_Html_Multi_Selection, submitListener)
		try {
			await act(async () => {
				await result.current.submitPendingTargets()
			})

			expect(submitListener).toHaveBeenCalledOnce()
			expect(result.current.activeTarget).toBeNull()
			expect(result.current.pendingTargets).toHaveLength(1)
			expect(result.current.isAppendPicking).toBe(false)
			expect(result.current.submitState).toBe("submitting")
			expect(inspector.stop).toHaveBeenCalled()

			act(() => {
				submittedRequest?.onSuccess?.()
			})
			expect(result.current.pendingTargets).toHaveLength(0)
			expect(result.current.submitState).toBe("idle")
		} finally {
			pubsub.unsubscribe(PubSubEvents.Submit_Html_Multi_Selection, submitListener)
		}
	})
})
