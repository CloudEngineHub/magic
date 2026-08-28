import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ElementInspectorOverlay } from "../ElementInspectorOverlay"
import type { HtmlSelectionTarget, InspectedElementInfo } from "../types"

const captureAcquire = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const captureRelease = vi.hoisted(() => vi.fn())

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../screenshot", async (importOriginal) => ({
	...(await importOriginal<typeof import("../screenshot")>()),
	captureIframeRegion: vi.fn().mockResolvedValue("data:image/png;base64,shot"),
	createCurrentTabCaptureSession: vi.fn(() => ({
		acquire: captureAcquire,
		release: captureRelease,
	})),
	supportsCurrentTabCapture: vi.fn(() => true),
	shouldPrewarmCurrentTabCapture: vi.fn(() => true),
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
			const highlight = document.querySelector(".border-blue-500")
			expect(highlight).toBeInTheDocument()
			expect(highlight).toHaveStyle({ transition: "" })
		} finally {
			HTMLIFrameElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
		}
	})

	it("moves the hover highlight without a transition", () => {
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
						active
						iframeRef={iframeRef}
						hoveredElement={createInfo()}
						selectedElement={null}
						onClearSelection={vi.fn()}
						hideInfoCard
					/>
				</div>,
			)

			expect(document.querySelector(".border-blue-500")).toHaveStyle({
				transition: "",
			})
		} finally {
			HTMLIFrameElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
		}
	})

	it("captures a preview for the selected element", async () => {
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
		const onCaptureElementScreenshot = vi.fn()

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
						onCaptureElementScreenshot={onCaptureElementScreenshot}
					/>
				</div>,
			)

			await waitFor(() => {
				expect(onCaptureElementScreenshot).toHaveBeenCalledWith(
					".row-item.ai",
					expect.objectContaining({ dataUrl: "data:image/png;base64,shot" }),
				)
			})
		} finally {
			HTMLIFrameElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
		}
	})

	it("keeps the capture session while an element preview is pending", async () => {
		captureRelease.mockClear()
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
		const onCaptureElementScreenshot = vi.fn()

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
						onCaptureElementScreenshot={onCaptureElementScreenshot}
					/>
				</div>,
			)

			await waitFor(() => expect(onCaptureElementScreenshot).toHaveBeenCalledOnce())
			expect(captureRelease).not.toHaveBeenCalled()
		} finally {
			HTMLIFrameElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
		}
	})

	it("prewarms current-tab capture for AI element selection", async () => {
		captureAcquire.mockClear()
		const iframeRef = { current: null as HTMLIFrameElement | null }
		let prewarm: (() => void) | null = null
		render(
			<div>
				<iframe ref={iframeRef} />
				<ElementInspectorOverlay
					active={false}
					iframeRef={iframeRef}
					hoveredElement={null}
					selectedElement={null}
					onClearSelection={vi.fn()}
					onCaptureElementScreenshot={vi.fn()}
					onCapturePrewarmReady={(callback) => {
						prewarm = callback
					}}
				/>
			</div>,
		)

		await waitFor(() => {
			expect(prewarm).toEqual(expect.any(Function))
		})
		prewarm?.()
		await waitFor(() => {
			expect(captureAcquire).toHaveBeenCalledOnce()
		})
	})

	it("does not capture selected elements when screenshot capture is unsupported", async () => {
		const iframeRef = { current: null as HTMLIFrameElement | null }
		const onCaptureElementScreenshot = vi.fn()
		render(
			<div>
				<iframe ref={iframeRef} />
				<ElementInspectorOverlay
					active={false}
					iframeRef={iframeRef}
					hoveredElement={null}
					selectedElement={createInfo()}
					onClearSelection={vi.fn()}
					onCaptureElementScreenshot={onCaptureElementScreenshot}
					screenshotSupported={false}
				/>
			</div>,
		)

		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(onCaptureElementScreenshot).not.toHaveBeenCalled()
	})

	it("hides screenshot mode when the browser lacks capture support", () => {
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
					screenshotSupported={false}
					onEditPendingTarget={vi.fn()}
					onRemovePendingTarget={vi.fn()}
					onSubmitPendingTargets={vi.fn()}
					selectionMode="screenshot"
					onSelectionModeChange={vi.fn()}
				/>
			</div>,
		)

		expect(
			screen.queryByRole("button", { name: "stylePanel.inspector.screenshotMode" }),
		).not.toBeInTheDocument()
		expect(screen.queryByTestId("html-screenshot-selection-overlay")).not.toBeInTheDocument()
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
		const panelContainerRef = createRef<HTMLDivElement>()
		HTMLElement.prototype.getBoundingClientRect = function () {
			if (this === panelContainerRef.current) {
				return {
					top: 0,
					left: 0,
					width: 900,
					height: 360,
					bottom: 360,
					right: 900,
					x: 0,
					y: 0,
					toJSON: () => ({}),
				} as DOMRect
			}
			if (this.querySelector?.("iframe")) return parentRect
			return originalElementRect.call(this)
		}

		const onCaptureScreenshot = vi.fn()
		const onConfirmTarget = vi.fn()
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
				<div ref={panelContainerRef} style={{ width: 900, height: 360 }}>
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
							onConfirmTarget={onConfirmTarget}
							onCancelTarget={vi.fn()}
							onEditPendingTarget={vi.fn()}
							onRemovePendingTarget={vi.fn()}
							onSubmitPendingTargets={vi.fn()}
							selectionMode="screenshot"
							panelContainerRef={panelContainerRef}
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
			const popover = screen.getByTestId("element-inspector-edit-popover")
			expect(popover.parentElement).toHaveAttribute("data-element-inspector-panel-portal")
			expect(popover.parentElement?.parentElement).toBe(panelContainerRef.current)
			const textarea = screen.getByRole("textbox")
			fireEvent.change(textarea, { target: { value: "Move this section lower" } })
			expect(textarea).toHaveValue("Move this section lower")
			fireEvent.click(screen.getByRole("button", { name: "stylePanel.inspector.confirm" }))
			expect(onConfirmTarget).toHaveBeenCalledOnce()
		} finally {
			HTMLIFrameElement.prototype.getBoundingClientRect = originalIframeRect
			HTMLElement.prototype.getBoundingClientRect = originalElementRect
		}
	})

	it("moves a confirmed screenshot highlight with iframe scrolling", async () => {
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
		const originalIframeRect = HTMLIFrameElement.prototype.getBoundingClientRect
		const originalElementRect = HTMLElement.prototype.getBoundingClientRect
		HTMLIFrameElement.prototype.getBoundingClientRect = () => iframeRect
		HTMLElement.prototype.getBoundingClientRect = function () {
			if (this.querySelector?.("iframe")) return iframeRect
			return originalElementRect.call(this)
		}

		const iframeRef = { current: null as HTMLIFrameElement | null }
		const target: HtmlSelectionTarget = {
			id: "screenshot:scroll",
			kind: "screenshot",
			screenshot: {
				dataUrl: "data:image/png;base64,shot",
				rect: { left: 20, top: 80, width: 200, height: 120 },
				documentRect: { left: 20, top: 780, width: 200, height: 120 },
			},
			instruction: "Keep this area",
		}

		try {
			render(
				<div style={{ width: 640, height: 360 }}>
					<iframe ref={iframeRef} />
					<ElementInspectorOverlay
						active={false}
						iframeRef={iframeRef}
						hoveredElement={null}
						selectedElement={null}
						onClearSelection={vi.fn()}
						pendingTargets={[target]}
						onEditPendingTarget={vi.fn()}
						onRemovePendingTarget={vi.fn()}
						onSubmitPendingTargets={vi.fn()}
					/>
				</div>,
			)

			const iframe = iframeRef.current
			if (!iframe?.contentWindow || !iframe.contentDocument) {
				throw new Error("Screenshot scroll fixture was not created")
			}
			Object.defineProperty(iframe.contentWindow, "scrollY", {
				configurable: true,
				value: 0,
			})
			const highlight = document.querySelector(".border-blue-500")
			expect(highlight).toHaveStyle({ top: "780px" })

			Object.defineProperty(iframe.contentWindow, "scrollY", {
				configurable: true,
				value: 700,
			})
			fireEvent.scroll(iframe.contentDocument)
			await waitFor(() => expect(highlight).toHaveStyle({ top: "80px" }))
		} finally {
			HTMLIFrameElement.prototype.getBoundingClientRect = originalIframeRect
			HTMLElement.prototype.getBoundingClientRect = originalElementRect
		}
	})

	it("does not fail when a bound iframe window becomes cross-origin", () => {
		let isCrossOrigin = false
		const securityError = () =>
			new DOMException("Blocked a cross-origin frame", "SecurityError")
		const iframeWindow = {} as Window
		Object.defineProperties(iframeWindow, {
			scrollX: {
				get: () => {
					if (isCrossOrigin) throw securityError()
					return 0
				},
			},
			scrollY: {
				get: () => {
					if (isCrossOrigin) throw securityError()
					return 0
				},
			},
			addEventListener: {
				get: () => {
					if (isCrossOrigin) throw securityError()
					return vi.fn()
				},
			},
			removeEventListener: {
				get: () => {
					if (isCrossOrigin) throw securityError()
					return vi.fn()
				},
			},
		})
		const iframe = document.createElement("iframe")
		Object.defineProperty(iframe, "contentDocument", {
			configurable: true,
			value: document,
		})
		Object.defineProperty(iframe, "contentWindow", {
			configurable: true,
			value: iframeWindow,
		})

		render(
			<ElementInspectorOverlay
				active={false}
				iframeRef={{ current: iframe }}
				hoveredElement={null}
				selectedElement={null}
				onClearSelection={vi.fn()}
			/>,
		)

		isCrossOrigin = true
		iframe.dispatchEvent(new Event("load"))
	})
})
