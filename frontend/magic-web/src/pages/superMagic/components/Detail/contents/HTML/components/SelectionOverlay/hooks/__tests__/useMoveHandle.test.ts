import { act, renderHook } from "@testing-library/react"
import type { Dispatch, RefObject, SetStateAction } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { HTMLEditorV2Ref } from "../../../../iframe-bridge/types/props"
import type { SelectedInfo } from "../../types"
import { useMoveHandle } from "../useMoveHandle"

describe("useMoveHandle", () => {
	const selectedInfo: SelectedInfo = {
		selector: "div.move-target",
		rect: {
			top: 20,
			left: 30,
			width: 120,
			height: 80,
		},
		computedStyles: {
			position: "relative",
			top: "0px",
			left: "0px",
		},
	}

	let editorRef: RefObject<HTMLEditorV2Ref>

	beforeEach(() => {
		editorRef = {
			current: {
				beginBatchOperation: vi.fn().mockResolvedValue(undefined),
				endBatchOperation: vi.fn().mockResolvedValue(undefined),
				cancelBatchOperation: vi.fn().mockResolvedValue(undefined),
				applyStylesTemporary: vi.fn().mockResolvedValue(undefined),
				refreshSelectedElement: vi.fn().mockResolvedValue(undefined),
			} as unknown as HTMLEditorV2Ref,
		}
	})

	afterEach(() => {
		document.body.style.userSelect = ""
		document.body.style.cursor = ""
		vi.restoreAllMocks()
	})

	function createPointerLikeEvent(type: string, clientX: number, clientY: number, buttons = 0) {
		const event = new Event(type, {
			bubbles: true,
			cancelable: true,
		})

		Object.defineProperties(event, {
			clientX: { configurable: true, value: clientX },
			clientY: { configurable: true, value: clientY },
			buttons: { configurable: true, value: buttons },
			preventDefault: { configurable: true, value: vi.fn() },
		})

		return event
	}

	it("survives a backlog of deferred move updates after pointerup", async () => {
		const deferredUpdaters: Array<(prev: SelectedInfo | null) => SelectedInfo | null> = []
		const setSelectedInfo: Dispatch<SetStateAction<SelectedInfo | null>> = vi.fn(
			(updater: SetStateAction<SelectedInfo | null>) => {
				if (typeof updater === "function") {
					deferredUpdaters.push(updater)
				}
			},
		)
		const pointerTarget = {
			setPointerCapture: vi.fn(),
			releasePointerCapture: vi.fn(),
		}

		const { result } = renderHook(() =>
			useMoveHandle({
				editorRef,
				isPptRender: false,
				scaleRatio: 1,
				selectedInfo,
				setSelectedInfo,
				setHoveredRect: vi.fn(),
				setIsSelectionMode: vi.fn(),
				iframeRef: { current: null },
			}),
		)

		await act(async () => {
			await result.current.onMoveHandleMouseDown({
				clientX: 100,
				clientY: 100,
				pointerId: 1,
				currentTarget: pointerTarget,
				preventDefault: vi.fn(),
				stopPropagation: vi.fn(),
			})
		})

		act(() => {
			for (let offset = 1; offset <= 40; offset += 1) {
				document.dispatchEvent(
					createPointerLikeEvent("pointermove", 100 + offset, 100 + offset, 1),
				)
			}
			document.dispatchEvent(createPointerLikeEvent("pointerup", 140, 140))
		})

		expect(deferredUpdaters).toHaveLength(40)
		let updatedInfo: SelectedInfo | null = selectedInfo
		expect(() => {
			for (const updater of deferredUpdaters) {
				updatedInfo = updater(updatedInfo)
			}
		}).not.toThrow()
		expect(updatedInfo?.rect).toEqual({
			top: 60,
			left: 70,
			width: 120,
			height: 80,
		})
	})
})
