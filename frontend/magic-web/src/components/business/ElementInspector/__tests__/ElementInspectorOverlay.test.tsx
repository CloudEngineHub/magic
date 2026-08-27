import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ElementInspectorOverlay } from "../ElementInspectorOverlay"
import type { HtmlSelectionTarget, InspectedElementInfo } from "../types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../screenshot", async (importOriginal) => ({
	...(await importOriginal<typeof import("../screenshot")>()),
	captureIframeRegion: vi.fn().mockResolvedValue("data:image/png;base64,shot"),
}))

function createInfo(): InspectedElementInfo {
	return {
		selector: ".row-item.ai",
		tagName: "div",
		id: "",
		classList: ["row-item", "ai"],
		rect: { top: 40, left: 20, width: 320, height: 44 },
		margin: { top: 0, right: 0, bottom: 0, left: 0 },
		padding: { top: 4, right: 8, bottom: 4, left: 8 },
		border: { top: 0, right: 0, bottom: 0, left: 0 },
		computedStyles: {},
		attributes: {},
		textContent: "AI response",
	}
}

describe("ElementInspectorOverlay", () => {
	it("renders the pending panel in the stable viewport container", async () => {
		const iframeRect = {
			top: 0,
			left: 0,
			width: 640,
			height: 360,
			bottom: 360,
			right: 640,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect
		const originalGetBoundingClientRect = HTMLIFrameElement.prototype.getBoundingClientRect
		HTMLIFrameElement.prototype.getBoundingClientRect = () => iframeRect

		try {
			const iframeRef = { current: null as HTMLIFrameElement | null }
			const panelContainerRef = createRef<HTMLDivElement>()
			render(
				<div data-testid="canvas-viewport" ref={panelContainerRef}>
					<div data-testid="scaled-content-wrapper">
						<iframe ref={iframeRef} />
					</div>
					<ElementInspectorOverlay
						active
						iframeRef={iframeRef}
						hoveredElement={null}
						selectedElement={null}
						onClearSelection={vi.fn()}
						panelContainerRef={panelContainerRef}
						onEditPendingTarget={vi.fn()}
						onRemovePendingTarget={vi.fn()}
						onSubmitPendingTargets={vi.fn()}
					/>
				</div>,
			)
			expect(panelContainerRef.current).toBe(screen.getByTestId("canvas-viewport"))

			await waitFor(() => {
				const panel = screen.getByTestId("element-inspector-pending-panel")
				expect(panel.parentElement).toHaveAttribute("data-element-inspector-panel-portal")
				expect(panel.parentElement?.parentElement).toBe(
					screen.getByTestId("canvas-viewport"),
				)
			})
		} finally {
			HTMLIFrameElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
		}
	})

	it("uses the waiting-state highlight and shows element information after selection", () => {
		const rect = {
			top: 0,
			left: 0,
			width: 640,
			height: 360,
			bottom: 360,
			right: 640,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect

		const originalGetBoundingClientRect = HTMLIFrameElement.prototype.getBoundingClientRect
		HTMLIFrameElement.prototype.getBoundingClientRect = () => rect

		try {
			const iframeRef = { current: null as HTMLIFrameElement | null }
			render(
				<div>
					<iframe ref={iframeRef} />
					<ElementInspectorOverlay
						active={false}
						iframeRef={iframeRef}
						hoveredElement={null}
						selectedElement={createInfo()}
						onClearSelection={vi.fn()}
						hideInfoCard
					/>
				</div>,
			)

			expect(screen.getByTestId("element-inspector-selection-label")).toHaveTextContent(
				"div.row-item.ai",
			)
			expect(screen.getByTestId("element-inspector-selection-label")).toHaveTextContent(
				"320 × 44",
			)
			expect(document.querySelector(".border-blue-500")).toBeInTheDocument()
		} finally {
			HTMLIFrameElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
		}
	})

	it("keeps confirmed targets highlighted while selecting another target", () => {
		const rect = {
			top: 0,
			left: 0,
			width: 640,
			height: 360,
			bottom: 360,
			right: 640,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect

		const originalGetBoundingClientRect = HTMLIFrameElement.prototype.getBoundingClientRect
		HTMLIFrameElement.prototype.getBoundingClientRect = () => rect

		try {
			const info = createInfo()
			const iframeRef = { current: null as HTMLIFrameElement | null }
			render(
				<div>
					<iframe ref={iframeRef} />
					<ElementInspectorOverlay
						active
						iframeRef={iframeRef}
						hoveredElement={null}
						selectedElement={null}
						onClearSelection={vi.fn()}
						pendingTargets={[
							{ id: info.selector, kind: "element", info, instruction: "Move it" },
						]}
						activeTarget={null}
						onEditPendingTarget={vi.fn()}
						onRemovePendingTarget={vi.fn()}
						onSubmitPendingTargets={vi.fn()}
					/>
				</div>,
			)

			expect(screen.getByTestId("element-inspector-selection-label")).toHaveTextContent(
				"div.row-item.ai",
			)
			expect(document.querySelector(".border-blue-500")).toBeInTheDocument()
		} finally {
			HTMLIFrameElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
		}
	})

	it("opens the existing target editor when its highlighted area is clicked", () => {
		const rect = {
			top: 0,
			left: 0,
			width: 640,
			height: 360,
			bottom: 360,
			right: 640,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect

		const originalGetBoundingClientRect = HTMLIFrameElement.prototype.getBoundingClientRect
		HTMLIFrameElement.prototype.getBoundingClientRect = () => rect

		try {
			const info = createInfo()
			const iframeRef = { current: null as HTMLIFrameElement | null }
			const Harness = () => {
				const [activeTarget, setActiveTarget] = useState<HtmlSelectionTarget | null>(null)
				const [instruction, setInstruction] = useState("")
				const target: HtmlSelectionTarget = {
					id: info.selector,
					kind: "element",
					info,
					instruction: "Move it",
				}
				return (
					<div>
						<iframe ref={iframeRef} />
						<ElementInspectorOverlay
							active
							iframeRef={iframeRef}
							hoveredElement={null}
							selectedElement={null}
							onClearSelection={vi.fn()}
							pendingTargets={[target]}
							activeTarget={activeTarget}
							draftInstruction={instruction}
							onDraftInstructionChange={setInstruction}
							onConfirmTarget={vi.fn()}
							onCancelTarget={vi.fn()}
							onEditPendingTarget={(nextTarget) => {
								setActiveTarget(nextTarget)
								setInstruction(nextTarget.instruction)
							}}
							onRemovePendingTarget={vi.fn()}
							onSubmitPendingTargets={vi.fn()}
						/>
					</div>
				)
			}
			render(<Harness />)

			fireEvent.click(screen.getByTestId("element-inspector-pending-target"))
			expect(screen.getByTestId("element-inspector-edit-popover")).toBeInTheDocument()
			expect(screen.getByRole("textbox")).toHaveValue("Move it")
		} finally {
			HTMLIFrameElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
		}
	})

	it("opens the screenshot comment popover after a drag", async () => {
		const iframeRect = {
			top: 0,
			left: 0,
			width: 640,
			height: 360,
			bottom: 360,
			right: 640,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect
		const parentRect = iframeRect
		const originalIframeRect = HTMLIFrameElement.prototype.getBoundingClientRect
		const originalElementRect = HTMLElement.prototype.getBoundingClientRect
		HTMLIFrameElement.prototype.getBoundingClientRect = () => iframeRect
		HTMLElement.prototype.getBoundingClientRect = function () {
			if (this.querySelector?.("iframe")) return parentRect
			return originalElementRect.call(this)
		}

		const onCaptureScreenshot = vi.fn()
		const iframeRef = { current: null as HTMLIFrameElement | null }
		function Harness() {
			const [instruction, setInstruction] = useState("")
			const [activeTarget, setActiveTarget] = useState<null | {
				kind: "screenshot"
				id: string
				screenshot: {
					dataUrl: string
					rect: { left: number; top: number; width: number; height: number }
				}
				instruction: string
			}>(null)
			return (
				<div style={{ width: 640, height: 360 }}>
					<iframe ref={iframeRef} />
					<ElementInspectorOverlay
						active={!activeTarget}
						iframeRef={iframeRef}
						hoveredElement={null}
						selectedElement={null}
						onClearSelection={vi.fn()}
						activeTarget={activeTarget}
						draftInstruction={instruction}
						onDraftInstructionChange={setInstruction}
						onConfirmTarget={vi.fn()}
						onCancelTarget={vi.fn()}
						onEditPendingTarget={vi.fn()}
						onRemovePendingTarget={vi.fn()}
						onSubmitPendingTargets={vi.fn()}
						selectionMode="screenshot"
						onCaptureScreenshot={(dataUrl, rect) => {
							onCaptureScreenshot(dataUrl, rect)
							setActiveTarget({
								id: "screenshot:1",
								kind: "screenshot",
								screenshot: { dataUrl, rect },
								instruction,
							})
						}}
					/>
				</div>
			)
		}

		try {
			render(<Harness />)
			const overlay = screen.getByTestId("html-screenshot-selection-overlay")
			vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue(iframeRect)
			const firePointer = (type: string, clientX: number, clientY: number) => {
				fireEvent(overlay, new MouseEvent(type, { bubbles: true, clientX, clientY }))
			}
			firePointer("pointerdown", 20, 30)
			firePointer("pointermove", 220, 150)
			firePointer("pointerup", 220, 150)

			await waitFor(() => {
				expect(onCaptureScreenshot).toHaveBeenCalledWith("data:image/png;base64,shot", {
					left: 20,
					top: 30,
					width: 200,
					height: 120,
				})
				expect(screen.getByTestId("element-inspector-edit-popover")).toBeInTheDocument()
			})
			const textarea = screen.getByRole("textbox")
			fireEvent.change(textarea, { target: { value: "Move this section lower" } })
			expect(textarea).toHaveValue("Move this section lower")
		} finally {
			HTMLIFrameElement.prototype.getBoundingClientRect = originalIframeRect
			HTMLElement.prototype.getBoundingClientRect = originalElementRect
		}
	})
})
