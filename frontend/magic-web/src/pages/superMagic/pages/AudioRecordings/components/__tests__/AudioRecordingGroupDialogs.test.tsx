import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { UNGROUPED_RECORDING_GROUP_ID } from "@/services/audioRecordings/RecordingGroupsConstants"
import type { AudioRecordingGroup } from "@/services/audioRecordings"
import {
	AudioRecordingGroupManageDialog,
	AudioRecordingMoveGroupDialog,
} from "../AudioRecordingGroupDialogs"

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { name?: string }) => {
			const labels: Record<string, string> = {
				"super:mobile.recordingEntry.groupSheet.manageTitle": "Manage groups",
				"super:mobile.recordingEntry.groupSheet.createTitle": "Create group",
				"super:mobile.recordingEntry.groupSheet.renameTitle": "Rename group",
				"super:mobile.recordingEntry.groupSheet.groupNameLabel": "Group name",
				"super:mobile.recordingEntry.groupSheet.renameLabel": "Group name",
				"super:mobile.recordingEntry.groupSheet.groupNamePlaceholder": "Group name",
				"super:mobile.recordingEntry.groupSheet.renamePlaceholder": "New name",
				"super:mobile.recordingEntry.groupSheet.newGroup": "New group",
				"super:mobile.recordingEntry.groupSheet.rename": "Rename",
				"super:mobile.recordingEntry.groupSheet.deleteGroup": "Delete group",
				"super:mobile.recordingEntry.groupSheet.ungrouped": "Ungrouped",
				"super:mobile.recordingEntry.groupSheet.unnamedGroup": "Mock unnamed group",
				"super:mobile.recordingEntry.groupSheet.deleteTitle": "Delete group",
				"super:mobile.recordingEntry.groupSheet.deleteConfirm":
					"Delete this mock group? Recordings move to Ungrouped.",
				"super:mobile.recordingEntry.moveGroupSheet.title": "Move to group",
				"audioRecordings:actions.confirm": "Confirm",
				"audioRecordings:actions.cancel": "Cancel",
				"audioRecordings:actions.submitting": "Submitting",
				"audioRecordings:empty.noCustomGroups": "No custom groups yet",
			}
			if (key === "super:mobile.recordingEntry.groupSheet.deleteConfirm" && options?.name) {
				return `Delete "${options.name}"? Recordings move to Ungrouped.`
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("@/components/shadcn-ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuItem: ({
		children,
		onClick,
		"data-testid": dataTestId,
	}: {
		children: React.ReactNode
		onClick?: () => void
		"data-testid"?: string
	}) => (
		<button type="button" data-testid={dataTestId} onClick={onClick}>
			{children}
		</button>
	),
}))

const mockGroups: AudioRecordingGroup[] = [
	{
		id: "workspace-mock-001",
		name: "Mock Alpha Group",
		projectCount: 2,
		isVirtual: false,
	},
	{
		id: "workspace-mock-002",
		name: "Mock Beta Group",
		projectCount: 1,
		isVirtual: false,
	},
]

describe("AudioRecordingGroupManageDialog", () => {
	it("renders mobile-aligned list and footer new-group trigger", () => {
		render(
			<AudioRecordingGroupManageDialog
				open
				onOpenChange={vi.fn()}
				groups={mockGroups}
				onCreateGroup={vi.fn()}
				onRenameGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("audio-recording-group-manage-dialog")).toBeInTheDocument()
		expect(screen.getByTestId("audio-recording-group-bordered-list")).toBeInTheDocument()
		expect(screen.getByTestId("audio-recording-group-create-trigger")).toBeInTheDocument()
		expect(screen.queryByTestId("audio-recording-move-group-option-ungrouped")).toBeNull()
		expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
	})

	it("creates a group via footer trigger and name dialog", async () => {
		const onCreateGroup = vi.fn().mockResolvedValue({
			id: "workspace-mock-003",
			name: "Mock New Group",
			projectCount: 0,
			isVirtual: false,
		})

		render(
			<AudioRecordingGroupManageDialog
				open
				onOpenChange={vi.fn()}
				groups={mockGroups}
				onCreateGroup={onCreateGroup}
				onRenameGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("audio-recording-group-create-trigger"))
		fireEvent.change(screen.getByTestId("audio-recording-group-name-input"), {
			target: { value: "Mock New Group" },
		})
		fireEvent.click(screen.getByTestId("audio-recording-group-name-confirm-btn"))

		await waitFor(() => {
			expect(onCreateGroup).toHaveBeenCalledWith("Mock New Group")
		})
	})
})

describe("AudioRecordingMoveGroupDialog", () => {
	it("renders ungrouped option and confirms move target", async () => {
		const onSelect = vi.fn().mockResolvedValue(undefined)
		const onOpenChange = vi.fn()

		render(
			<AudioRecordingMoveGroupDialog
				open
				onOpenChange={onOpenChange}
				groups={mockGroups}
				selectedGroupId={UNGROUPED_RECORDING_GROUP_ID}
				onSelect={onSelect}
			/>,
		)

		expect(
			screen.getByTestId("audio-recording-move-group-option-ungrouped"),
		).toBeInTheDocument()
		fireEvent.click(screen.getByTestId("audio-recording-move-group-confirm-btn"))

		await waitFor(() => {
			expect(onSelect).toHaveBeenCalledWith(UNGROUPED_RECORDING_GROUP_ID)
			expect(onOpenChange).toHaveBeenCalledWith(false)
		})
	})

	it("auto-selects a newly created group when CRUD handlers are provided", async () => {
		const onCreateGroup = vi.fn().mockResolvedValue({
			id: "workspace-mock-003",
			name: "Mock Created Group",
			projectCount: 0,
			isVirtual: false,
		})
		const onSelect = vi.fn().mockResolvedValue(undefined)

		render(
			<AudioRecordingMoveGroupDialog
				open
				onOpenChange={vi.fn()}
				groups={mockGroups}
				selectedGroupId={UNGROUPED_RECORDING_GROUP_ID}
				onSelect={onSelect}
				onCreateGroup={onCreateGroup}
				onRenameGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("audio-recording-group-create-trigger"))
		fireEvent.change(screen.getByTestId("audio-recording-group-name-input"), {
			target: { value: "Mock Created Group" },
		})
		fireEvent.click(screen.getByTestId("audio-recording-group-name-confirm-btn"))

		await waitFor(() => {
			expect(onCreateGroup).toHaveBeenCalledWith("Mock Created Group")
		})

		fireEvent.click(screen.getByTestId("audio-recording-move-group-confirm-btn"))

		await waitFor(() => {
			expect(onSelect).toHaveBeenCalledWith("workspace-mock-003")
		})
	})

	it("truncates an excessively long group name without breaking row layout", () => {
		const longName = "Mock long group name ".repeat(8).trim()
		const longNameGroups: AudioRecordingGroup[] = [
			{
				id: "workspace-mock-long",
				name: longName,
				projectCount: 0,
				isVirtual: false,
			},
		]

		render(
			<AudioRecordingMoveGroupDialog
				open
				onOpenChange={vi.fn()}
				groups={longNameGroups}
				selectedGroupId="workspace-mock-long"
				onSelect={vi.fn()}
				onCreateGroup={vi.fn()}
				onRenameGroup={vi.fn()}
				onDeleteGroup={vi.fn()}
			/>,
		)

		const row = screen.getByTestId("audio-recording-move-group-option-workspace-mock-long")
		const label = within(row).getByTitle(longName)
		expect(label).toHaveClass("truncate")
	})

	it("opens delete confirmation from more menu and calls onDeleteGroup", async () => {
		const onDeleteGroup = vi.fn().mockResolvedValue(undefined)

		render(
			<AudioRecordingMoveGroupDialog
				open
				onOpenChange={vi.fn()}
				groups={mockGroups}
				selectedGroupId="workspace-mock-001"
				onSelect={vi.fn()}
				onCreateGroup={vi.fn()}
				onRenameGroup={vi.fn()}
				onDeleteGroup={onDeleteGroup}
			/>,
		)

		const row = screen.getByTestId("audio-recording-move-group-option-workspace-mock-001")
		const rowWrapper = row.parentElement
		expect(rowWrapper).not.toBeNull()
		if (!rowWrapper) return
		fireEvent.click(within(rowWrapper).getByTestId("audio-recording-group-delete-menu-item"))

		expect(screen.getByTestId("audio-recording-group-delete-dialog")).toBeInTheDocument()
		fireEvent.click(screen.getByTestId("audio-recording-group-delete-confirm-btn"))

		await waitFor(() => {
			expect(onDeleteGroup).toHaveBeenCalledWith("workspace-mock-001")
		})
	})
})
