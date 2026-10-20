import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { usePPTBuildNavigation } from "../usePPTBuildNavigation"
import type { PPTBuildController } from "../usePPTBuildPlayback"

function setup() {
	let page = "a"
	let presenting = true
	let allowed = true
	const changePage = vi.fn(async () => {
		page = page === "a" ? "b" : "a"
	})
	const jumpPage = vi.fn(async () => true)
	const hook = renderHook(() =>
		usePPTBuildNavigation({
			getPageKey: () => page,
			isPresenting: () => presenting,
			canNavigate: () => allowed,
			changePage,
			jumpPage,
			firstPage: vi.fn(async () => true),
		}),
	)
	const setStep = vi.fn(async (step: number) => {
		controller = { ...controller, state: { step, total: 2 } }
		hook.result.current.register(page, controller)
		return true
	})
	let controller: PPTBuildController = {
		state: { step: 0, total: 2 },
		setStep,
		acceptsMessage: () => true,
	}
	act(() => hook.result.current.register(page, controller))
	return {
		...hook,
		changePage,
		jumpPage,
		setStep,
		setPresenting: (value: boolean) => {
			presenting = value
		},
		setAllowed: (value: boolean) => {
			allowed = value
		},
	}
}
describe("PPT build navigation", () => {
	it("consumes each group, then changes page on the following action", async () => {
		const h = setup()
		await act(() => h.result.current.changeSlide("next"))
		expect(h.result.current.progress.step).toBe(1)
		await act(() => h.result.current.changeSlide("next"))
		expect(h.changePage).not.toHaveBeenCalled()
		await act(() => h.result.current.changeSlide("next"))
		expect(h.changePage).toHaveBeenCalledOnce()
	})
	it("rewinds groups and enters the previous page at its end only at step zero", async () => {
		const h = setup()
		await act(() => h.result.current.changeSlide("next"))
		await act(() => h.result.current.changeSlide("prev"))
		expect(h.setStep).toHaveBeenLastCalledWith(0, false)
		expect(h.changePage).not.toHaveBeenCalled()
		await act(() => h.result.current.changeSlide("prev"))
		expect(h.result.current.startAtEnd.current).toBe(true)
		expect(h.changePage).toHaveBeenCalledOnce()
	})
	it("does not fall through to page navigation when the frame fails", async () => {
		const h = setup()
		h.setStep.mockResolvedValue(false)
		await act(() => h.result.current.changeSlide("next"))
		expect(h.changePage).not.toHaveBeenCalled()
	})
	it("keeps the current step when a guarded jump is cancelled", async () => {
		const h = setup()
		await act(() => h.result.current.changeSlide("next"))
		h.setStep.mockClear()
		h.jumpPage.mockResolvedValue(false)
		await act(() => h.result.current.handleJumpToPage(1))
		expect(h.setStep).not.toHaveBeenCalled()
		expect(h.result.current.progress.step).toBe(1)
	})
	it("preserves ordinary reading and guarded busy navigation", async () => {
		const h = setup()
		h.setAllowed(false)
		await act(() => h.result.current.changeSlide("next"))
		expect(h.setStep).not.toHaveBeenCalled()
		h.setAllowed(true)
		h.setPresenting(false)
		await act(() => h.result.current.changeSlide("next"))
		expect(h.changePage).toHaveBeenCalledOnce()
	})
})
