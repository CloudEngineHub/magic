import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { CanvasMarkerMentionData } from "@/components/business/MentionPanel/types"
import MarkerTooltip from "../index"

vi.mock("@/components/shadcn-ui/popover", async () => {
	const React = await import("react")
	const PopoverOpenContext = React.createContext(false)

	return {
		Popover: ({ open, children }: { open?: boolean; children: React.ReactNode }) => (
			<PopoverOpenContext.Provider value={Boolean(open)}>
				{children}
			</PopoverOpenContext.Provider>
		),
		PopoverAnchor: ({ children }: { children: React.ReactNode }) => <>{children}</>,
		PopoverContent: ({ children }: { children: React.ReactNode }) =>
			React.useContext(PopoverOpenContext) ? (
				<div data-testid="popover-content">{children}</div>
			) : null,
	}
})

vi.mock("../MarkerTooltipPreview", () => ({
	default: ({ markerData }: { markerData: CanvasMarkerMentionData }) => (
		<div data-testid="marker-tooltip-preview">{markerData.marker_id}</div>
	),
}))

vi.mock("../MarkerDropdown", () => ({
	default: () => <div data-testid="marker-dropdown" />,
}))

const loadingMarker = {
	marker_id: "marker-1",
	design_project_id: "design-1",
	loading: true,
	mark_type: 1,
	image: "./images/marker.png",
	element_width: 100,
	element_height: 100,
} as CanvasMarkerMentionData

describe("MarkerTooltip", () => {
	it("shows the image preview on hover while marker recognition is loading", () => {
		render(
			<MarkerTooltip
				markerData={loadingMarker}
				isInMessageList={false}
				loading
				imageUrl="blob:marker-preview"
			>
				<span>Marker</span>
			</MarkerTooltip>,
		)

		expect(screen.queryByTestId("marker-tooltip-preview")).not.toBeInTheDocument()

		fireEvent.mouseEnter(screen.getByTestId("handle-mouse-enter"))

		expect(screen.getByTestId("marker-tooltip-preview")).toHaveTextContent("marker-1")
		expect(screen.queryByTestId("marker-dropdown")).not.toBeInTheDocument()

		fireEvent.mouseLeave(screen.getByTestId("handle-mouse-enter"))

		expect(screen.queryByTestId("marker-tooltip-preview")).not.toBeInTheDocument()
	})
})
