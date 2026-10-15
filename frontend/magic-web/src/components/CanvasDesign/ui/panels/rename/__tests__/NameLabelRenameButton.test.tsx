import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import NameLabelRenameButton from "../NameLabelRenameButton"

const mocks = vi.hoisted(() => ({
	canvas: undefined as
		| {
				elementRenameManager: { startRename: ReturnType<typeof vi.fn> }
				eventEmitter: unknown
				hoverManager: { getHoveredElementId: () => string | null }
				nameLabelManager: {
					getCachedImageNameLabelLayout: ReturnType<typeof vi.fn>
					getImageNameLabelLayout: ReturnType<typeof vi.fn>
					subscribeIconRefresh?: (
						listener: (elementIds?: readonly string[]) => void,
					) => () => void
					setRenameButtonElementId: ReturnType<typeof vi.fn>
					setDOMLabelElementId: ReturnType<typeof vi.fn>
				}
				selectionManager: { getSelectedIds: ReturnType<typeof vi.fn> }
		  }
		| undefined,
	containerRef: { current: null as HTMLDivElement | null },
	handlers: {} as Record<string, (...events: Array<{ data: unknown } | undefined>) => void>,
	iconRefreshListener: undefined as ((elementIds?: readonly string[]) => void) | undefined,
}))

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({ canvas: mocks.canvas }),
}))

vi.mock("../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({
		t: (_key: string, options?: string | Record<string, unknown>) => {
			if (typeof options === "string") return options
			if (options && typeof options.defaultValue === "string") {
				return options.defaultValue.replace("{{reason}}", String(options.reason ?? ""))
			}
			return _key
		},
	}),
}))

vi.mock("../../../../app/providers/MagicProvider", () => ({
	useMagic: () => ({ methods: undefined }),
}))

vi.mock("../../../../app/hooks/canvas", () => ({
	useCanvasElement: () => null,
}))

vi.mock("../../../../app/hooks/canvas/useGenerationRuntime", () => ({
	useGenerationRuntime: () => null,
}))

vi.mock("../../../../app/hooks/canvas/useCanvasEvent", () => ({
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

vi.mock("../../../../app/hooks/layout/useFloatingComponent", () => ({
	useFloatingComponent: () => ({ containerRef: mocks.containerRef }),
}))

vi.mock("../../../primitives/custom/PortalContainerContext", () => ({
	usePortalContainer: () => document.body,
}))

vi.mock("@/components/base/MagicTooltip", () => ({
	default: ({ children }: { children: React.ReactElement }) => children,
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
	return { cancelAnimationFrame, flush, requestAnimationFrame }
}

describe("NameLabelRenameButton motion layout", () => {
	beforeEach(() => {
		mocks.handlers = {}
		mocks.containerRef.current = null
		mocks.canvas = {
			elementRenameManager: { startRename: vi.fn() },
			eventEmitter: {},
			hoverManager: { getHoveredElementId: () => null },
			nameLabelManager: {
				getImageNameLabelLayout: vi.fn(() => ({
					x: 10,
					y: 20,
					width: 80,
					rowWidth: 80,
					height: 12,
					text: "Image name",
					fontSize: 12,
					fontFamily: "Arial",
					color: "#737373",
					canRename: true,
					showRenameButton: true,
					renameButtonGap: 4,
					hitPadding: 2,
				})),
				getCachedImageNameLabelLayout: vi.fn(() => ({
					x: 42,
					y: 28,
					width: 64,
					rowWidth: 64,
					height: 12,
					text: "Image name",
					fontSize: 12,
					fontFamily: "Arial",
					color: "#737373",
					canRename: true,
					showRenameButton: false,
					renameButtonGap: 0,
					hitPadding: 2,
				})),
				subscribeIconRefresh: vi.fn(
					(listener: (elementIds?: readonly string[]) => void) => {
						mocks.iconRefreshListener = listener
						return vi.fn()
					},
				),
				setRenameButtonElementId: vi.fn(),
				setDOMLabelElementId: vi.fn(),
			},
			selectionManager: { getSelectedIds: vi.fn(() => ["image-1"]) },
		}
	})

	afterEach(() => {
		cleanup()
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it("uses the cached layout during viewport motion without rerunning label layout", () => {
		const animationFrame = createAnimationFrameHarness()
		render(<NameLabelRenameButton />)

		const label = screen.getByText("Image name")
		const root = label.closest<HTMLElement>("[data-canvas-ui-component]")
		expect(root).not.toBeNull()
		expect(root).toHaveStyle({ transform: "translate(8px, 18px)" })
		const fullLayoutCalls =
			mocks.canvas?.nameLabelManager.getImageNameLabelLayout.mock.calls.length

		act(() => {
			mocks.handlers["viewport:pan"]?.({ data: { x: 32, y: 8 } })
			mocks.handlers["viewport:pan"]?.({ data: { x: 33, y: 9 } })
		})

		expect(animationFrame.requestAnimationFrame).toHaveBeenCalledTimes(1)
		expect(mocks.canvas?.nameLabelManager.getImageNameLabelLayout).toHaveBeenCalledTimes(
			fullLayoutCalls,
		)

		act(() => animationFrame.flush())

		expect(mocks.canvas?.nameLabelManager.getCachedImageNameLabelLayout).toHaveBeenCalledWith(
			"image-1",
		)
		expect(root).toHaveStyle({ height: "16px", transform: "translate(40px, 26px)" })
		expect(screen.getByRole("button", { hidden: true })).toHaveStyle({ display: "none" })
	})

	it("ignores updates for elements outside the active label", () => {
		createAnimationFrameHarness()
		render(<NameLabelRenameButton />)
		const fullLayoutCalls =
			mocks.canvas?.nameLabelManager.getImageNameLabelLayout.mock.calls.length
		const getSelectedIds = mocks.canvas?.selectionManager.getSelectedIds
		getSelectedIds?.mockClear()

		act(() => {
			mocks.handlers["element:updated"]?.({
				data: { elementId: "other-image" },
			})
		})

		expect(mocks.canvas?.nameLabelManager.getImageNameLabelLayout).toHaveBeenCalledTimes(
			fullLayoutCalls,
		)
		expect(getSelectedIds).not.toHaveBeenCalled()
	})

	it("cancels a pending motion read and reconciles the final viewport layout", () => {
		const animationFrame = createAnimationFrameHarness()
		render(<NameLabelRenameButton />)
		const fullLayoutCalls =
			mocks.canvas?.nameLabelManager.getImageNameLabelLayout.mock.calls.length ?? 0

		act(() => {
			mocks.handlers["viewport:pan"]?.({ data: { x: 32, y: 8 } })
			mocks.handlers["viewport:changed"]?.({
				data: {
					scale: 1,
					position: { x: 32, y: 8 },
					source: "wheel",
					phase: "end",
				},
			})
		})

		expect(animationFrame.cancelAnimationFrame).toHaveBeenCalledTimes(1)
		expect(mocks.canvas?.nameLabelManager.getImageNameLabelLayout).toHaveBeenCalledTimes(
			fullLayoutCalls + 1,
		)

		act(() => animationFrame.flush())
		expect(mocks.canvas?.nameLabelManager.getCachedImageNameLabelLayout).not.toHaveBeenCalled()
	})

	it("restores a temporarily hidden DOM label when the final layout is unchanged", () => {
		const animationFrame = createAnimationFrameHarness()
		mocks.canvas?.nameLabelManager.getCachedImageNameLabelLayout.mockReturnValueOnce(null)
		render(<NameLabelRenameButton />)
		const root = screen
			.getByText("Image name")
			.closest<HTMLElement>("[data-canvas-ui-component]")
		expect(root).not.toBeNull()

		act(() => {
			mocks.handlers["viewport:pan"]?.({ data: { x: 32, y: 8 } })
			animationFrame.flush()
		})
		expect(root).toHaveStyle({ display: "none" })

		act(() => {
			mocks.handlers["viewport:changed"]?.({
				data: {
					scale: 1,
					position: { x: 32, y: 8 },
					source: "wheel",
					phase: "end",
				},
			})
		})

		expect(root).toHaveStyle({ display: "flex", transform: "translate(8px, 18px)" })
	})

	it("renders a hoverable hit area for the failed-compliance icon", () => {
		mocks.canvas?.nameLabelManager.getImageNameLabelLayout.mockReturnValueOnce({
			x: 10,
			y: 20,
			width: 80,
			height: 12,
			text: "Image name",
			fontSize: 12,
			fontFamily: "Arial",
			color: "#737373",
			canRename: true,
			showRenameButton: false,
			renameButtonGap: 0,
			hitPadding: 2,
			complianceIcon: {
				x: 0,
				y: 20,
				width: 16,
				height: 16,
				failedReason: "素材审核未通过",
			},
		})

		render(<NameLabelRenameButton />)

		const icon = screen.getByRole("img")
		expect(icon).toHaveAttribute("aria-label", "合规校验未通过：素材审核未通过")
		expect(icon).toHaveClass("cursor-pointer")
		expect(icon).toHaveStyle({ left: "0px", top: "0px", width: "16px", height: "16px" })
		const root = icon.closest<HTMLElement>("[data-canvas-ui-component]")
		expect(root).toHaveStyle({ transform: "translate(-2px, 18px)" })
	})

	it("refreshes the compliance tooltip only for its active element", () => {
		let failedReason = "旧的审核原因"
		mocks.canvas?.nameLabelManager.getImageNameLabelLayout.mockImplementation(() => ({
			x: 10,
			y: 20,
			width: 80,
			height: 12,
			text: "Image name",
			fontSize: 12,
			fontFamily: "Arial",
			color: "#737373",
			canRename: true,
			showRenameButton: false,
			renameButtonGap: 0,
			hitPadding: 0,
			complianceIcon: {
				x: 0,
				y: 20,
				width: 16,
				height: 16,
				failedReason,
			},
		}))

		render(<NameLabelRenameButton />)
		expect(screen.getByRole("img")).toHaveAttribute(
			"aria-label",
			"合规校验未通过：旧的审核原因",
		)

		failedReason = "新的审核原因"
		act(() => mocks.iconRefreshListener?.(["other-image"]))
		expect(screen.getByRole("img")).toHaveAttribute(
			"aria-label",
			"合规校验未通过：旧的审核原因",
		)

		act(() => mocks.iconRefreshListener?.(["image-1"]))
		expect(screen.getByRole("img")).toHaveAttribute(
			"aria-label",
			"合规校验未通过：新的审核原因",
		)
	})
})
