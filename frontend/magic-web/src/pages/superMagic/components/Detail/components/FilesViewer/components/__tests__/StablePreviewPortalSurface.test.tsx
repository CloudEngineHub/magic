import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import StablePreviewPortalSurface from "../StablePreviewPortalSurface"

describe("StablePreviewPortalSurface PPT viewport", () => {
	let anchor: HTMLDivElement
	beforeEach(() => {
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe = vi.fn()
				disconnect = vi.fn()
			},
		)
		anchor = document.createElement("div")
		anchor.style.visibility = "visible"
		document.body.appendChild(anchor)
		vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
			top: 40,
			left: 80,
			width: 600,
			height: 400,
		} as DOMRect)
	})
	afterEach(async () => {
		cleanup()
		await Promise.resolve()
		anchor.remove()
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
	})

	it.each([
		["data-presenter-console", "true", true],
		["data-mobile-fullscreen", "landscape", true],
		["data-presenter-console", "true", false],
		["data-mobile-fullscreen", "landscape", false],
	] as const)(
		"promotes the existing host for %s=%s (isPpt=%s) and restores its anchor on exit",
		async (attribute, value, isPpt) => {
			render(
				<StablePreviewPortalSurface
					anchor={anchor}
					enabled
					visible
					isPpt={isPpt}
					isFullscreen={false}
					borderRadius="12px"
				>
					<div data-testid="ppt-root">
						<iframe title="slide" />
					</div>
				</StablePreviewPortalSurface>,
			)
			const root = screen.getByTestId("ppt-root")
			const frame = screen.getByTitle("slide")
			const host = root.parentElement
			if (!host) throw new Error("Missing portal host")
			expect(host).toHaveStyle({
				left: "80px",
				top: "40px",
				width: "600px",
				height: "400px",
				zIndex: "10",
			})
			await act(async () => root.setAttribute(attribute, value))
			expect(host).toHaveStyle({
				left: "0px",
				top: "0px",
				width: `${window.innerWidth}px`,
				height: `${window.innerHeight}px`,
				zIndex: "900",
				borderRadius: "0px",
			})
			await act(async () => root.removeAttribute(attribute))
			expect(host).toHaveStyle({
				left: "80px",
				top: "40px",
				width: "600px",
				height: "400px",
				zIndex: "10",
				borderRadius: "12px",
			})
			expect(screen.getByTitle("slide")).toBe(frame)
			expect(root.parentElement).toBe(host)
		},
	)

	it("detects a presenter subtree mounted or removed after the portal", async () => {
		const view = (presenter: boolean) => (
			<StablePreviewPortalSurface anchor={anchor} enabled visible isPpt isFullscreen>
				<div data-testid="ppt-root">
					{presenter && <div data-presenter-console="true" />}
				</div>
			</StablePreviewPortalSurface>
		)
		const { rerender } = render(view(false))
		const host = screen.getByTestId("ppt-root").parentElement
		if (!host) throw new Error("Missing portal host")
		await act(async () => rerender(view(true)))
		expect(host.style.zIndex).toBe("calc(var(--z-index-detail-fullscreen) + 1)")
		expect(host).toHaveStyle({ left: "0px", width: `${window.innerWidth}px` })
		await act(async () => rerender(view(false)))
		expect(host.style.zIndex).toBe("calc(var(--z-index-detail-fullscreen) + 1)")
		expect(host).toHaveStyle({ left: "80px", width: "600px" })
	})
})
