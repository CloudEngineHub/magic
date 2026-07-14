import { act, render } from "@testing-library/react"
import { createRef } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MarkmapBaseRef } from "../components/MarkmapBase"
import MarkmapBase from "../components/MarkmapBase"

const markmapBaseFitMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock("markmap-view", () => ({
	Markmap: {
		create: () => ({
			setData: vi.fn().mockResolvedValue(undefined),
			fit: markmapBaseFitMock,
			destroy: vi.fn(),
			setOptions: vi.fn(),
		}),
	},
}))

vi.mock("../markmap", () => ({
	ensureMarkmapInitialized: vi.fn().mockResolvedValue(undefined),
	transformer: {
		transform: () => ({ root: { content: "mock-root" } }),
	},
}))

const sampleMarkdown = "# Root\n\n## Branch"

describe("MarkmapBase.resize", () => {
	beforeEach(() => {
		markmapBaseFitMock.mockClear()
	})

	it("syncs svg dimensions and refits the markmap viewport", async () => {
		const ref = createRef<MarkmapBaseRef>()

		render(
			<div style={{ width: 640, height: 480 }}>
				<MarkmapBase ref={ref} options={{ autoFit: true }} data={sampleMarkdown} />
			</div>,
		)

		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})

		const svg = ref.current?.dom.current
		expect(svg).toBeTruthy()
		if (!svg) return

		Object.defineProperty(svg, "clientWidth", { configurable: true, value: 960 })
		Object.defineProperty(svg, "clientHeight", { configurable: true, value: 720 })

		act(() => {
			ref.current?.resize()
		})

		expect(svg?.getAttribute("width")).toBe("960px")
		expect(svg?.getAttribute("height")).toBe("720px")
		expect(markmapBaseFitMock).toHaveBeenCalled()
	})
})
