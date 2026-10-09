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
					setDOMLabelElementId: ReturnType<typeof vi.fn>
				}
				selectionManager: { getSelectedIds: ReturnType<typeof vi.fn> }
		  }
		| undefined,
	containerRef: { current: null as HTMLDivElement | null },
	handlers: {} as Record<string, (...events: Array<{ data: unknown } | undefined>) => void>,
}))

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({ canvas: mocks.canvas }),
}))

vi.mock("../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({
		t: (_key: string, fallback?: string) => fallback ?? _key,
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
					height: 12,
					text: "Image name",
					fontSize: 12,
					fontFamily: "Arial",
					color: "#737373",
					canRename: true,
					showRenameButton: true,
				})),
				getCachedImageNameLabelLayout: vi.fn(() => ({
					x: 42,
					y: 28,
					width: 64,
					height: 12,
					text: "Image name",
					fontSize: 12,
					fontFamily: "Arial",
					color: "#737373",
					canRename: true,
					showRenameButton: false,
				})),
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
		expect(root).toHaveStyle({ transform: "translate(10px, 14px)" })
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
		expect(root).toHaveStyle({ transform: "translate(42px, 22px)" })
		expect(screen.getByRole("button", { hidden: true })).toHaveAttribute("hidden")
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
		expect(root).toHaveAttribute("hidden")

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

		expect(root).not.toHaveAttribute("hidden")
		expect(root).toHaveStyle({ transform: "translate(10px, 14px)" })
	})
})
