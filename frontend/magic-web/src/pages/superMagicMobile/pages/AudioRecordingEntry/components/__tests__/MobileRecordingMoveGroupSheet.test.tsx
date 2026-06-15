import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { UNGROUPED_RECORDING_GROUP_ID } from "@/services/audioRecordings/RecordingGroupsConstants"
import { MobileRecordingMoveGroupSheet } from "../MobileRecordingMoveGroupSheet"
import type { MobileRecordingGroup } from "../MobileRecordingGroupSheet"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"mobile.recordingEntry.groupSheet.ungrouped": "Ungrouped",
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

describe("MobileRecordingMoveGroupSheet", () => {
	it("marks ungrouped as selected when selectedGroupId is the ungrouped virtual id", () => {
		render(
			<MobileRecordingMoveGroupSheet
				open
				onOpenChange={vi.fn()}
				groups={groups}
				selectedGroupId={UNGROUPED_RECORDING_GROUP_ID}
				ungroupedCount={3}
				onSelect={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("mobile-recording-move-group-option-ungrouped")).toContainElement(
			screen.getByText("Ungrouped"),
		)
		expect(
			screen.getByTestId("mobile-recording-move-group-option-ungrouped").querySelector("svg"),
		).not.toBeNull()
	})
})
