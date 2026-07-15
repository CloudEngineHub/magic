import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
	ALL_RECORDING_GROUP_ID,
	UNGROUPED_RECORDING_GROUP_ID,
} from "@/services/audioRecordings/RecordingGroupsConstants"
import { MobileRecordingMoveGroupSheet } from "../MobileRecordingMoveGroupSheet"
import type { MobileRecordingGroup } from "../MobileRecordingGroupSheet"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"mobile.recordingEntry.groupSheet.ungrouped": "Ungrouped",
				"mobile.recordingEntry.groupSheet.unnamedGroup": "Mock unnamed group",
				"mobile.recordingEntry.moveGroupSheet.title": "Move to group",
				"mobile.recordingEntry.moveGroupSheet.closeAria": "Close",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({
		children,
		visible,
		headerLeadingAction,
	}: {
		children: React.ReactNode
		visible: boolean
		headerLeadingAction?: { onClick: () => void; testId?: string }
	}) =>
		visible ? (
			<div data-testid="mock-magic-popup">
				{headerLeadingAction ? (
					<button
						type="button"
						data-testid={headerLeadingAction.testId}
						onClick={headerLeadingAction.onClick}
					>
						close
					</button>
				) : null}
				{children}
			</div>
		) : null,
}))

const groups: MobileRecordingGroup[] = [
	{
		id: "workspace-audio-001",
		name: "Mock work group",
		projectCount: 2,
		isVirtual: false,
	},
]

function renderMoveGroupSheet(
	overrides: Partial<React.ComponentProps<typeof MobileRecordingMoveGroupSheet>> = {},
) {
	const onOpenChange = vi.fn()
	const onSelect = vi.fn()

	render(
		<MobileRecordingMoveGroupSheet
			open
			onOpenChange={onOpenChange}
			groups={groups}
			selectedGroupId={UNGROUPED_RECORDING_GROUP_ID}
			ungroupedCount={3}
			onSelect={onSelect}
			{...overrides}
		/>,
	)

	return { onOpenChange, onSelect }
}

describe("MobileRecordingMoveGroupSheet", () => {
	it("marks ungrouped as selected when selectedGroupId is the ungrouped virtual id", () => {
		renderMoveGroupSheet({ selectedGroupId: UNGROUPED_RECORDING_GROUP_ID })

		expect(screen.getByTestId("mobile-recording-move-group-option-ungrouped")).toContainElement(
			screen.getByText("Ungrouped"),
		)
		expect(
			screen.getByTestId("mobile-recording-move-group-option-ungrouped").querySelector("svg"),
		).not.toBeNull()
	})

	it("renders the selected checkmark before the destination label", () => {
		renderMoveGroupSheet({ selectedGroupId: "workspace-audio-001" })

		const row = screen.getByTestId("mobile-recording-move-group-option")
		const label = screen.getByText("Mock work group")
		const check = row.querySelector("svg")

		expect(check).not.toBeNull()
		expect(row.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
	})

	it("does not expose the aggregate all group as a move target", () => {
		renderMoveGroupSheet()

		expect(screen.queryByTestId("mobile-recording-move-group-option-all")).toBeNull()
		expect(screen.queryByText(ALL_RECORDING_GROUP_ID)).toBeNull()
	})

	it("selects a custom destination and closes the sheet", () => {
		const { onOpenChange, onSelect } = renderMoveGroupSheet()

		fireEvent.click(screen.getByTestId("mobile-recording-move-group-option"))

		expect(onSelect).toHaveBeenCalledWith("workspace-audio-001")
		expect(onOpenChange).toHaveBeenCalledWith(false)
	})

	it("closes from the header action without selecting a destination", () => {
		const { onOpenChange, onSelect } = renderMoveGroupSheet()

		fireEvent.click(screen.getByTestId("mobile-recording-move-group-close"))

		expect(onSelect).not.toHaveBeenCalled()
		expect(onOpenChange).toHaveBeenCalledWith(false)
	})

	it("shows a fallback label when a group name is empty", () => {
		renderMoveGroupSheet({
			groups: [
				{
					id: "workspace-audio-empty",
					name: "",
					projectCount: 1,
					isVirtual: false,
				},
			],
		})

		expect(screen.getByText("Mock unnamed group")).toBeInTheDocument()
	})
})
