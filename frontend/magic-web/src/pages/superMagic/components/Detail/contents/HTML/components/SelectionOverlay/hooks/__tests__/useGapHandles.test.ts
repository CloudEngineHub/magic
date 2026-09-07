import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useGapHandles } from "../useGapHandles"
import type { GapAxis } from "../../utils/gapHandleLayout"
import type { SelectedInfo } from "../../types"

describe("useGapHandles", () => {
	let mockEditorRef: {
		current: {
			beginBatchOperation: ReturnType<typeof vi.fn>
			endBatchOperation: ReturnType<typeof vi.fn>
			cancelBatchOperation: ReturnType<typeof vi.fn>
			applyStylesTemporary: ReturnType<typeof vi.fn>
			refreshSelectedElement: ReturnType<typeof vi.fn>
		}
	}

	beforeEach(() => {
		mockEditorRef = {
			current: {
				beginBatchOperation: vi.fn().mockResolvedValue(undefined),
				endBatchOperation: vi.fn().mockResolvedValue(undefined),
				cancelBatchOperation: vi.fn().mockResolvedValue(undefined),
				applyStylesTemporary: vi.fn().mockResolvedValue(undefined),
				refreshSelectedElement: vi.fn().mockResolvedValue(undefined),
			},
		}

		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			callback(0)
			return 1
		})
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	function createFlexSelectedInfo(): SelectedInfo {
		return {
			selector: "div.flex-row",
			rect: {
				top: 0,
				left: 0,
				width: 220,
				height: 100,
			},
			childRects: [
				{ top: 10, left: 10, width: 80, height: 80 },
				{ top: 10, left: 110, width: 80, height: 80 },
			],
			computedStyles: {
				display: "flex",
				columnGap: "16px",
				rowGap: "16px",
			},
		}
	}

	/**
	 * Build a pointer-like event for jsdom so hook tests can exercise document listeners.
	 */
	function createPointerLikeEvent(
		type: string,
		init: {
			clientX: number
			clientY: number
			buttons?: number
		},
	) {
		const event = new Event(type, {
			bubbles: true,
			cancelable: true,
		})

		Object.defineProperties(event, {
			clientX: { configurable: true, value: init.clientX },
			clientY: { configurable: true, value: init.clientY },
			buttons: { configurable: true, value: init.buttons ?? 0 },
			preventDefault: { configurable: true, value: vi.fn() },
		})

		return event
	}

	async function dragGap(options: {
		selectedInfo: SelectedInfo
		axis: GapAxis
		gapAxesLinked: boolean
		startX?: number
		startY?: number
		moveX: number
		moveY: number
		onPreviewStyles?: (styles: Partial<{ rowGap: string; columnGap: string }>) => void
		skipPointerUp?: boolean
	}) {
		const onPreviewStyles = options.onPreviewStyles ?? vi.fn()
		const { result } = renderHook(() =>
			useGapHandles({
				editorRef: mockEditorRef as any,
				selectedInfo: options.selectedInfo,
				gapAxesLinked: options.gapAxesLinked,
				onPreviewStyles,
			}),
		)

		const pointerTarget = {
			setPointerCapture: vi.fn(),
			releasePointerCapture: vi.fn(),
		}

		await act(async () => {
			await result.current.onGapHandlePointerDown(
				{
					clientX: options.startX ?? 100,
					clientY: options.startY ?? 100,
					pointerId: 1,
					currentTarget: pointerTarget,
					preventDefault: vi.fn(),
					stopPropagation: vi.fn(),
				} as any,
				options.axis,
			)
		})

		await act(async () => {
			document.dispatchEvent(
				createPointerLikeEvent("pointermove", {
					clientX: options.moveX,
					clientY: options.moveY,
					buttons: 1,
				}),
			)
		})

		if (!options.skipPointerUp) {
			await act(async () => {
				document.dispatchEvent(
					createPointerLikeEvent("pointerup", {
						clientX: options.moveX,
						clientY: options.moveY,
					}),
				)
			})
		}

		return { result, onPreviewStyles }
	}

	it("writes columnGap only when a column drag is unlinked", async () => {
		await dragGap({
			selectedInfo: createFlexSelectedInfo(),
			axis: "column",
			gapAxesLinked: false,
			moveX: 120,
			moveY: 100,
		})

		expect(mockEditorRef.current.applyStylesTemporary).toHaveBeenCalledWith("div.flex-row", {
			columnGap: "36px",
		})
	})

	it("writes both axes when gapAxesLinked is true", async () => {
		await dragGap({
			selectedInfo: createFlexSelectedInfo(),
			axis: "column",
			gapAxesLinked: true,
			moveX: 120,
			moveY: 100,
		})

		expect(mockEditorRef.current.applyStylesTemporary).toHaveBeenCalledWith("div.flex-row", {
			rowGap: "36px",
			columnGap: "36px",
		})
	})

	it("calls endBatchOperation once on pointer up", async () => {
		await dragGap({
			selectedInfo: createFlexSelectedInfo(),
			axis: "column",
			gapAxesLinked: false,
			moveX: 120,
			moveY: 100,
		})

		expect(mockEditorRef.current.endBatchOperation).toHaveBeenCalledTimes(1)
		expect(mockEditorRef.current.refreshSelectedElement).toHaveBeenCalledWith("div.flex-row")
	})

	it("does not write a gap below 0", async () => {
		await dragGap({
			selectedInfo: createFlexSelectedInfo(),
			axis: "column",
			gapAxesLinked: false,
			moveX: 70,
			moveY: 100,
		})

		expect(mockEditorRef.current.applyStylesTemporary).toHaveBeenCalledWith("div.flex-row", {
			columnGap: "0px",
		})
	})

	it("sends the same px map to onPreviewStyles during move", async () => {
		const onPreviewStyles = vi.fn()

		await dragGap({
			selectedInfo: createFlexSelectedInfo(),
			axis: "column",
			gapAxesLinked: false,
			moveX: 120,
			moveY: 100,
			onPreviewStyles,
			skipPointerUp: true,
		})

		expect(onPreviewStyles).toHaveBeenCalledWith({ columnGap: "36px" })
	})
})
