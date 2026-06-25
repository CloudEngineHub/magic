import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import enUS from "@/assets/locales/en_US/super.json"
import zhCN from "@/assets/locales/zh_CN/super.json"
import SelfMediaSplashScreen from "../components/SelfMediaSplashScreen"

const splashTranslations = vi.hoisted(() => ({
	"detail.selfMedia.splash.subtitle": "Localized splash badge",
	"detail.selfMedia.splash.headingFirstLine": "Localized heading line one",
	"detail.selfMedia.splash.headingSecondLine": "Localized heading line two",
	"detail.selfMedia.splash.description": "Localized splash description",
	"detail.selfMedia.splash.startCreating": "Localized start",
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => splashTranslations[key as keyof typeof splashTranslations] || key,
	}),
}))

describe("SelfMediaSplashScreen", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it("renders the content system launch copy with subtle motion details", () => {
		const onComplete = vi.fn()
		render(<SelfMediaSplashScreen onComplete={onComplete} />)

		expect(screen.getByText("Localized splash badge")).toBeInTheDocument()
		expect(screen.getByText("Localized heading line one")).toBeInTheDocument()
		expect(screen.getByText("Localized heading line two")).toBeInTheDocument()
		expect(screen.getByText("Localized splash description")).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Localized start" })).toBeInTheDocument()
		expect(screen.queryByText("建立创作系统")).not.toBeInTheDocument()
		expect(screen.queryByText("建立你的内容创作系统")).not.toBeInTheDocument()
		expect(screen.queryByText("一处创作，")).not.toBeInTheDocument()
		expect(screen.queryByText("触达所有人")).not.toBeInTheDocument()
		expect(screen.getByTestId("self-media-splash-system-flow")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-splash-action-dot")).toBeInTheDocument()
	})

	it("keeps the splash copy available in both super locale files", () => {
		expect(zhCN.detail.selfMedia.splash).toEqual({
			subtitle: "Magic · 自媒体",
			headingFirstLine: "让每一次灵感",
			headingSecondLine: "都听到回响",
			description: "收集灵感 · 输出内容 · 沉淀回响",
			startCreating: "开始创作",
		})
		expect(enUS.detail.selfMedia.splash).toEqual({
			subtitle: "Magic · Self Media",
			headingFirstLine: "Turn every spark",
			headingSecondLine: "into a lasting echo",
			description: "Capture ideas · publish content · compound feedback",
			startCreating: "Start creating",
		})
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
		fireEvent.click(screen.getByRole("button", { name: "Localized start" }))

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
		expect(styles).toContain("splash-system-flow")
		expect(styles).toContain("splash-action-dot")
		expect(styles).toContain("prefers-reduced-motion: reduce")
		expect(styles).not.toContain("splash-white-mask")
		expect(styles).not.toContain("62%")
		expect(styles).not.toContain("68%")
	})
})
