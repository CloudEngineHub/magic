import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PPTTransitionPanel from "../PPTTransitionPanel"
import PPTTransitionPreview from "../PPTTransitionPreview"

const { animate, cancel } = vi.hoisted(() => ({ animate: vi.fn(), cancel: vi.fn() }))
const layout = vi.hoisted(() => ({ mobile: false }))
vi.mock("../../utils/pptTransitionAnimation", () => ({ animatePPTTransition: animate }))

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => layout.mobile }))
vi.mock("framer-motion", async (importOriginal) => ({
	...(await importOriginal<typeof import("framer-motion")>()),
	useReducedMotion: () => true,
}))

const base = {
	open: true,
	deckKey: "deck-a",
	activePath: "a.html",
	selectedPaths: [],
	slides: [{ path: "a.html", label: "A" }],
	config: undefined,
	busy: false,
	onOpenChange: vi.fn(),
}

describe("PPTTransitionPanel", () => {
	beforeEach(() => {
		layout.mobile = false
	})

	it("stays in its parent layout and restores entry focus after Escape", () => {
		const onOpenChange = vi.fn()
		const view = (open: boolean) => (
			<div>
				<button>open panel</button>
				<PPTTransitionPanel
					{...base}
					open={open}
					onOpenChange={onOpenChange}
					onSave={vi.fn()}
				/>
			</div>
		)
		const { container, rerender } = render(view(false))
		const opener = screen.getByRole("button", { name: "open panel" })
		opener.focus()
		rerender(view(true))
		const panel = screen.getByRole("complementary", { name: "ppt.transitions.title" })
		expect(container).toContainElement(panel)
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		expect(document.querySelector('[data-slot="sheet-overlay"]')).not.toBeInTheDocument()
		expect(within(panel).getByRole("button", { name: "ppt.transitions.close" })).toHaveFocus()
		fireEvent.keyDown(panel, { key: "Escape" })
		expect(onOpenChange).toHaveBeenCalledWith(false)
		rerender(view(false))
		expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
		expect(opener).toHaveFocus()
	})

	it("uses a bounded inline bottom section on mobile", () => {
		layout.mobile = true
		const { container } = render(<PPTTransitionPanel {...base} onSave={vi.fn()} />)
		const panel = screen.getByRole("complementary", { name: "ppt.transitions.title" })
		expect(container).toContainElement(panel)
		expect(panel).toHaveClass("h-[45%]", "max-h-[360px]", "w-full", "border-t")
		expect(panel).not.toHaveAttribute("aria-modal")
	})

	it("uses shared animation only for explicit preview requests", () => {
		animate.mockReset()
		cancel.mockReset()
		animate.mockReturnValue({ cancel, finished: Promise.resolve() })
		const transition = { effect: "fade" as const, duration_ms: 400 }
		const { rerender, unmount } = render(
			<PPTTransitionPreview transition={transition} run={0} reducedMotion={false} />,
		)
		expect(animate).not.toHaveBeenCalled()
		rerender(<PPTTransitionPreview transition={transition} run={1} reducedMotion={false} />)
		expect(animate).toHaveBeenCalledTimes(1)
		rerender(<PPTTransitionPreview transition={transition} run={1} reducedMotion />)
		expect(cancel).toHaveBeenCalledTimes(1)
		rerender(<PPTTransitionPreview transition={transition} run={1} reducedMotion={false} />)
		expect(animate).toHaveBeenCalledTimes(1)
		unmount()
		render(<PPTTransitionPreview transition={transition} run={1} reducedMotion={false} />)
		expect(animate).toHaveBeenCalledTimes(1)
	})

	it("allows duration input to be cleared before entering a new valid value", async () => {
		const onSave = vi.fn().mockResolvedValue(true)
		render(<PPTTransitionPanel {...base} onSave={onSave} />)
		fireEvent.click(screen.getByRole("button", { name: "ppt.transitions.fade" }))
		const duration = screen.getByLabelText("ppt.transitions.duration")
		fireEvent.change(duration, { target: { value: "" } })
		expect(duration).toHaveValue(null)
		fireEvent.change(duration, { target: { value: "0.75" } })
		fireEvent.blur(duration)
		fireEvent.click(screen.getByRole("button", { name: "ppt.transitions.save" }))
		await waitFor(() =>
			expect(onSave).toHaveBeenCalledWith(
				expect.objectContaining({
					transition: expect.objectContaining({ duration_ms: 750 }),
				}),
			),
		)
	})
	it("previews a draft without saving and strips parameters when choosing none", async () => {
		const onSave = vi.fn().mockResolvedValue(true)
		render(<PPTTransitionPanel {...base} onSave={onSave} />)
		fireEvent.click(screen.getByRole("button", { name: "ppt.transitions.push" }))
		expect(screen.getByLabelText("ppt.transitions.duration")).toHaveValue(0.45)
		fireEvent.click(screen.getByRole("button", { name: "ppt.transitions.preview" }))
		expect(onSave).not.toHaveBeenCalled()
		expect(screen.getByText("ppt.transitions.example")).toBeInTheDocument()
		expect(screen.getByText("ppt.transitions.reducedMotion")).toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "ppt.transitions.none" }))
		expect(screen.queryByLabelText("ppt.transitions.duration")).not.toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "ppt.transitions.save" }))
		await waitFor(() =>
			expect(onSave).toHaveBeenCalledWith(
				expect.objectContaining({ transition: { effect: "none" } }),
			),
		)
	})
	it("keeps failed edits in the close confirmation and lets the user cancel", async () => {
		const onOpenChange = vi.fn()
		render(
			<PPTTransitionPanel
				{...base}
				onOpenChange={onOpenChange}
				onSave={vi.fn().mockResolvedValue(false)}
			/>,
		)
		fireEvent.click(screen.getByRole("button", { name: "ppt.transitions.fade" }))
		fireEvent.click(screen.getByRole("button", { name: "ppt.transitions.close" }))
		const confirm = screen.getByRole("alertdialog")
		fireEvent.click(within(confirm).getByRole("button", { name: "ppt.transitions.save" }))
		await waitFor(() =>
			expect(
				within(confirm).getByRole("button", { name: "ppt.transitions.save" }),
			).toBeEnabled(),
		)
		expect(screen.getByRole("alertdialog")).toBeInTheDocument()
		expect(onOpenChange).not.toHaveBeenCalled()
		fireEvent.click(within(confirm).getByRole("button", { name: "common.cancel" }))
		await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
		expect(screen.getByRole("button", { name: "ppt.transitions.fade" })).toHaveAttribute(
			"aria-pressed",
			"true",
		)
	})
})
