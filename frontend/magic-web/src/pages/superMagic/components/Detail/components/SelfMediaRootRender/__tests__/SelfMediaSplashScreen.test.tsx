import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import SelfMediaSplashScreen from "../components/SelfMediaSplashScreen"

describe("SelfMediaSplashScreen", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it("renders a varied orbit gallery", () => {
		const onComplete = vi.fn()
		render(<SelfMediaSplashScreen onComplete={onComplete} />)

		const tiles = screen.getAllByTestId("self-media-splash-tile")
		expect(tiles.length).toBeGreaterThan(50)
		expect(
			new Set(tiles.map((tile) => `${tile.style.width}/${tile.style.height}`)).size,
		).toBeGreaterThan(4)
		expect(tiles[0].style.getPropertyValue("--tile-angle")).toBe("0deg")
		expect(tiles[0].style.transform).toContain("rotate(0deg) translateX(")
	})

	it("keeps the copy and orbit gallery on the same visual center", () => {
		const onComplete = vi.fn()
		render(<SelfMediaSplashScreen onComplete={onComplete} />)

		expect(screen.getByTestId("self-media-splash-root")).toHaveStyle({
			"--self-media-splash-stage-y": "calc(50% - clamp(8px, 1.8vmin, 24px))",
		})
		expect(screen.getByTestId("self-media-splash-copy").parentElement).toHaveClass(
			"top-[var(--self-media-splash-stage-y)]",
		)
		expect(screen.getAllByTestId("self-media-splash-tile")[0]).toHaveClass(
			"ring-zinc-950/[0.16]",
		)
	})

	it("places each ring's top tile on the vertical center line", () => {
		const onComplete = vi.fn()
		render(<SelfMediaSplashScreen onComplete={onComplete} />)

		const topAlignedTiles = screen
			.getAllByTestId("self-media-splash-tile")
			.filter((tile) => tile.style.getPropertyValue("--tile-angle").trim() === "270deg")

		expect(topAlignedTiles).toHaveLength(4)
	})

	it("keeps the orbit spinning while contracting on action engagement", () => {
		const onComplete = vi.fn()
		render(<SelfMediaSplashScreen onComplete={onComplete} />)

		const root = screen.getByTestId("self-media-splash-root")
		const action = screen.getByTestId("self-media-splash-action")
		const ringShells = screen.getAllByTestId("self-media-splash-ring-shell")
		const ring = document.querySelector(".self-media-splash-ring")

		expect(ringShells).toHaveLength(4)
		expect(ringShells[0]).toHaveAttribute("data-engaged", "false")
		expect(ringShells[0]).toHaveAttribute("data-motion-state", "rest")
		expect(ring).toHaveStyle({
			animation: "splash-orbit-spin 86s linear infinite normal",
		})

		fireEvent.pointerEnter(action)
		expect(root).toHaveClass("self-media-splash-action-engaged")
		expect(ringShells[0]).toHaveAttribute("data-engaged", "true")
		expect(ringShells[0]).toHaveAttribute("data-motion-state", "contracted")
		expect(ringShells.map((shell) => shell.getAttribute("data-target-scale"))).toEqual([
			"0.96",
			"0.92",
			"0.88",
			"0.84",
		])

		fireEvent.pointerLeave(action)
		expect(root).not.toHaveClass("self-media-splash-action-engaged")
		expect(ringShells[0]).toHaveAttribute("data-engaged", "false")
		expect(ringShells[0]).toHaveAttribute("data-motion-state", "rest")
	})

	it("exits with separated motion and no transition mask", () => {
		vi.useFakeTimers()
		const onComplete = vi.fn()
		render(<SelfMediaSplashScreen onComplete={onComplete} />)

		const ringShell = screen.getAllByTestId("self-media-splash-ring-shell")[0]
		fireEvent.click(screen.getByRole("button", { name: "开始创作" }))

		expect(screen.queryByTestId("self-media-splash-exit-mask")).not.toBeInTheDocument()
		expect(ringShell).toHaveAttribute("data-motion-state", "release")
		expect(screen.getAllByTestId("self-media-splash-ring-shell")[0]).toHaveAttribute(
			"data-target-scale",
			"0.94,0.94,0.94",
		)
		expect(screen.getByTestId("self-media-splash-root")).toHaveClass(
			"self-media-splash-root-exit",
		)
		expect(screen.getByTestId("self-media-splash-gallery")).toHaveClass(
			"self-media-splash-gallery-exit",
		)
		expect(screen.getByTestId("self-media-splash-copy")).toHaveClass(
			"self-media-splash-copy-exit",
		)
		expect(screen.getByTestId("self-media-splash-action")).toHaveClass(
			"self-media-splash-action-exit",
		)

		act(() => {
			vi.advanceTimersByTime(1500)
		})
		expect(onComplete).toHaveBeenCalledTimes(1)
	})

	it("starts revealing the workspace without a delayed mask hold", () => {
		const onComplete = vi.fn()
		render(<SelfMediaSplashScreen onComplete={onComplete} />)

		const styles = Array.from(document.querySelectorAll("style"))
			.map((style) => style.textContent ?? "")
			.join("\n")

		expect(styles).toContain("34%")
		expect(styles).toContain("9%")
		expect(styles).toContain("calc(var(--tile-radius) - 22px)")
		expect(styles).not.toContain("splash-white-mask")
		expect(styles).not.toContain("62%")
		expect(styles).not.toContain("68%")
	})
})
