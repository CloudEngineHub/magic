import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ModeItem } from "@/pages/superMagic/pages/Workspace/types"
import {
	SLIDES_TEMPLATE_RANDOM_DRAG_END_EVENT,
	SLIDES_TEMPLATE_RANDOM_DRAG_START_EVENT,
	SLIDES_TEMPLATE_RANDOM_DRAG_TYPE,
} from "../../constants"
import PptModeSwitcherCard from "../PptModeSwitcherCard"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: { count?: string }) =>
			key === "pptEmployee.delivered"
				? `已制作 ${values?.count} 页`
				: key === "pptEmployee.deliveredPrivate"
					? `已制作 ${values?.count} 套`
					: key,
	}),
}))

const isPrivateDeploymentMock = vi.hoisted(() => vi.fn(() => false))

vi.mock("@/utils/env", () => ({
	isPrivateDeployment: isPrivateDeploymentMock,
}))

vi.mock("../../../ModeAvatar", () => ({
	default: () => <span data-testid="mode-avatar" />,
}))

const useSlidesTemplateStatisticsMock = vi.hoisted(() => vi.fn())
const useElementVisibilityMock = vi.hoisted(() => vi.fn(() => true))

vi.mock("@/pages/superMagic/hooks/useSlidesTemplateTotal", () => ({
	useSlidesTemplateStatistics: useSlidesTemplateStatisticsMock,
}))

vi.mock("@/pages/superMagic/hooks/useAnimatedNumber", () => ({
	useAnimatedNumber: (value: number | undefined) => value,
	useAnimatedNumberPulse: () => false,
}))

vi.mock("@/pages/superMagic/components/AnimatedNumberText", () => ({
	AnimatedNumberText: ({ value }: { value: number | undefined }) => (
		<>{value?.toLocaleString("en-US")}</>
	),
}))

vi.mock("@/pages/superMagic/hooks/useElementVisibility", () => ({
	useElementVisibility: useElementVisibilityMock,
}))

const modeItem = {
	mode: {
		name: "PPT 制作专家",
		identifier: "ppt",
		icon_url: "",
	},
} as ModeItem

describe("PptModeSwitcherCard", () => {
	beforeEach(() => {
		isPrivateDeploymentMock.mockReturnValue(false)
		useElementVisibilityMock.mockReturnValue(true)
		useSlidesTemplateStatisticsMock.mockReturnValue({
			templateTotal: 101582,
			templateTotalUsageCount: 7293,
		})
	})

	it("keeps a fixed pill height while the preview expands above it", () => {
		const { rerender } = render(
			<PptModeSwitcherCard modeItem={modeItem} isSelected={false} onSelect={vi.fn()} />,
		)

		const card = screen.getByTestId("ppt-mode-switcher-card")
		const trigger = screen.getByTestId("ppt-mode-switcher-trigger")
		expect(card).toHaveClass("h-10")
		expect(card).not.toHaveClass("h-[76px]")
		expect(trigger).toHaveClass(
			"bg-background",
			"text-foreground",
			"hover:bg-foreground",
			"hover:text-background",
		)
		expect(trigger).toHaveAttribute("data-accent-state", "idle")
		expect(screen.getByTestId("ppt-mode-switcher-preview")).toHaveClass(
			"bottom-9",
			"scale-[0.78]",
			"opacity-70",
		)

		rerender(<PptModeSwitcherCard modeItem={modeItem} isSelected onSelect={vi.fn()} />)

		expect(card).toHaveClass("h-10")
		expect(card).not.toHaveClass("h-[76px]")
		expect(trigger).toHaveClass(
			"h-10",
			"rounded-full",
			"p-[3px]",
			"shadow-none",
			"bg-foreground",
			"text-background",
		)
		expect(trigger).toHaveAttribute("data-accent-state", "selected")
	})

	it("does not change layout height on hover", () => {
		render(<PptModeSwitcherCard modeItem={modeItem} isSelected={false} onSelect={vi.fn()} />)

		const trigger = screen.getByTestId("ppt-mode-switcher-trigger")
		const preview = screen.getByTestId("ppt-mode-switcher-preview")
		const previewFrames = screen.getAllByTestId("ppt-mode-switcher-preview-frame")
		const previewImages = preview.querySelectorAll("img")

		expect(trigger).toHaveAttribute("data-accent-state", "idle")
		expect(previewFrames[0]).toHaveClass("left-0", "-rotate-[12.69deg]")
		expect(previewFrames[1]).toHaveClass("left-[25.69px]", "rotate-[15deg]")
		expect(previewFrames[2]).toHaveClass("left-[57px]", "-rotate-[12.69deg]")
		expect(previewFrames.every((frame) => frame.dataset.active === "false")).toBe(true)
		expect(previewImages).toHaveLength(3)

		fireEvent.mouseEnter(trigger)

		expect(screen.getByTestId("ppt-mode-switcher-card")).toHaveClass("h-10")
		expect(preview).toHaveClass("translate-y-0.5", "scale-100", "opacity-100")
		expect(previewFrames[0]).toHaveClass("-translate-x-2", "-rotate-[18deg]")
		expect(previewFrames[1]).toHaveClass("translate-x-[3px]", "rotate-0")
		expect(previewFrames[2]).toHaveClass("translate-x-2", "rotate-[18deg]")
		expect(trigger).toHaveAttribute("data-accent-state", "hovered")
		expect(previewFrames.every((frame) => frame.dataset.active === "true")).toBe(true)

		fireEvent.mouseLeave(trigger)

		expect(trigger).toHaveAttribute("data-accent-state", "idle")
	})

	it("marks each preview slide as a random-template drag source", () => {
		render(<PptModeSwitcherCard modeItem={modeItem} isSelected onSelect={vi.fn()} />)

		const previewFrames = screen.getAllByTestId("ppt-mode-switcher-preview-frame")
		const setData = vi.fn()
		const dataTransfer = {
			effectAllowed: "none",
			setData,
		}
		const handleDragStart = vi.fn()
		const handleDragEnd = vi.fn()
		window.addEventListener(SLIDES_TEMPLATE_RANDOM_DRAG_START_EVENT, handleDragStart)
		window.addEventListener(SLIDES_TEMPLATE_RANDOM_DRAG_END_EVENT, handleDragEnd)

		expect(previewFrames).toHaveLength(3)
		expect(previewFrames.every((frame) => frame.draggable)).toBe(true)
		fireEvent.dragStart(previewFrames[1], { dataTransfer })
		fireEvent.dragEnd(previewFrames[1], { dataTransfer })

		expect(dataTransfer.effectAllowed).toBe("copy")
		expect(setData).toHaveBeenCalledWith(SLIDES_TEMPLATE_RANDOM_DRAG_TYPE, "1")
		expect(handleDragStart).toHaveBeenCalledTimes(1)
		expect(handleDragEnd).toHaveBeenCalledTimes(1)

		window.removeEventListener(SLIDES_TEMPLATE_RANDOM_DRAG_START_EVENT, handleDragStart)
		window.removeEventListener(SLIDES_TEMPLATE_RANDOM_DRAG_END_EVENT, handleDragEnd)
	})

	it("renders the template cumulative usage count as the delivered count", () => {
		render(<PptModeSwitcherCard modeItem={modeItem} isSelected onSelect={vi.fn()} />)

		const deliveredCount = screen.getByTestId("ppt-mode-switcher-delivered-count")
		expect(deliveredCount).toHaveTextContent("已制作7,293页")
		expect(deliveredCount).toHaveClass("text-background/70")
	})

	it("uses decks as the delivered count unit in private deployments", () => {
		isPrivateDeploymentMock.mockReturnValue(true)
		render(<PptModeSwitcherCard modeItem={modeItem} isSelected onSelect={vi.fn()} />)

		expect(screen.getByTestId("ppt-mode-switcher-delivered-count")).toHaveTextContent(
			"已制作7,293套",
		)
	})

	it("does not render the delivered count before the backend returns the new field", () => {
		useSlidesTemplateStatisticsMock.mockReturnValue({ templateTotal: 101582 })
		render(<PptModeSwitcherCard modeItem={modeItem} isSelected onSelect={vi.fn()} />)

		expect(screen.queryByTestId("ppt-mode-switcher-delivered-count")).not.toBeInTheDocument()
	})

	it("only enables statistics while the card is visible", () => {
		useElementVisibilityMock.mockReturnValue(false)
		render(<PptModeSwitcherCard modeItem={modeItem} isSelected onSelect={vi.fn()} />)

		expect(useSlidesTemplateStatisticsMock).toHaveBeenCalledWith({ enabled: false })
	})
})
