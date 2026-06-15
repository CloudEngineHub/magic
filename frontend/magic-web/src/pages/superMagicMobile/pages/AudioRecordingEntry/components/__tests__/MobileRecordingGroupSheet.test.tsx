import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
	ALL_RECORDING_GROUP_ID,
	UNGROUPED_RECORDING_GROUP_ID,
	type MobileRecordingGroup,
	MobileRecordingGroupSheet,
} from "../MobileRecordingGroupSheet"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"super:mobile.recordingEntry.groupSheet.all": "All",
				"super:mobile.recordingEntry.groupSheet.ungrouped": "Ungrouped",
				"super:mobile.recordingEntry.groupSheet.manageGroups": "Manage groups",
				"super:mobile.recordingEntry.groupSheet.newGroup": "New group",
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
		headerTrailingAction,
	}: {
		children: React.ReactNode
		visible: boolean
		headerLeadingAction?: { onClick: () => void; testId?: string }
		headerTrailingAction?: { onClick: () => void; testId?: string; disabled?: boolean }
	}) =>
		visible ? (
			<div data-testid="mock-magic-popup">
				{headerLeadingAction ? (
					<button
						type="button"
						data-testid={headerLeadingAction.testId}
						onClick={headerLeadingAction.onClick}
					>
						leading
					</button>
				) : null}
				{headerTrailingAction ? (
					<button
						type="button"
						data-testid={headerTrailingAction.testId}
						onClick={headerTrailingAction.onClick}
						disabled={headerTrailingAction.disabled}
					>
						trailing
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
		projectCount: 3,
		isVirtual: false,
	},
	{
		id: "workspace-audio-002",
		name: "Mock meeting group",
		projectCount: 2,
		isVirtual: false,
	},
]

describe("MobileRecordingGroupSheet", () => {
	it("selects real and virtual groups from menu view", () => {
		const onSelect = vi.fn()
		const onOpenChange = vi.fn()

		render(
			<MobileRecordingGroupSheet
				open
				onOpenChange={onOpenChange}
				groups={groups}
				selectedGroupId={ALL_RECORDING_GROUP_ID}
				totalCount={6}
				ungroupedCount={1}
				onSelect={onSelect}
				onCreateGroup={vi.fn()}
				onRenameGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-group-option-ungrouped"))

		expect(onSelect).toHaveBeenCalledWith(UNGROUPED_RECORDING_GROUP_ID)
		expect(onOpenChange).toHaveBeenCalledWith(false)
	})

	it("does not expose virtual groups in manage view", () => {
		render(
			<MobileRecordingGroupSheet
				open
				onOpenChange={vi.fn()}
				groups={groups}
				selectedGroupId={ALL_RECORDING_GROUP_ID}
				totalCount={6}
				ungroupedCount={1}
				onSelect={vi.fn()}
				onCreateGroup={vi.fn()}
				onRenameGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-group-manage-trigger"))

		const manageList = screen.getByTestId("mobile-recording-group-manage-list")
		expect(within(manageList).getAllByTestId("mobile-recording-group-manage-row")).toHaveLength(
			2,
		)
		expect(within(manageList).queryByText("All")).toBeNull()
		expect(within(manageList).queryByText("Ungrouped")).toBeNull()
	})
})
