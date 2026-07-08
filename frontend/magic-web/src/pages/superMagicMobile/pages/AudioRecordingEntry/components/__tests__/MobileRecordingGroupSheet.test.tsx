import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
	ALL_RECORDING_GROUP_ID,
	UNGROUPED_RECORDING_GROUP_ID,
	type MobileRecordingGroup,
	MobileRecordingGroupSheet,
} from "../MobileRecordingGroupSheet"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { name?: string }) => {
			const labels: Record<string, string> = {
				"super:mobile.recordingEntry.groupSheet.all": "All",
				"super:mobile.recordingEntry.groupSheet.ungrouped": "Ungrouped",
				"super:mobile.recordingEntry.groupSheet.newGroup": "New group",
				"super:mobile.recordingEntry.groupSheet.unnamedGroup": "Mock unnamed group",
				"super:mobile.recordingEntry.groupSheet.rename": "Rename",
				"super:mobile.recordingEntry.groupSheet.deleteGroup": "Delete group",
				"super:mobile.recordingEntry.groupSheet.deleteConfirm":
					'Delete "{{name}}"? Recordings in it will be moved to Ungrouped.',
				"super:mobile.recordingEntry.groupSheet.moreGroupAria": "More actions for {{name}}",
			}
			const template = labels[key] ?? key
			if (options?.name) return template.replace("{{name}}", options.name)
			return template
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
		headerTrailingAction?: {
			onClick: () => void
			testId?: string
			disabled?: boolean
			tone?: string
		}
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
						data-tone={headerTrailingAction.tone}
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

function renderGroupSheet(
	overrides: Partial<React.ComponentProps<typeof MobileRecordingGroupSheet>> = {},
) {
	const onSelect = vi.fn()
	const onOpenChange = vi.fn()
	const onCreateGroup = vi.fn().mockResolvedValue(undefined)
	const onRenameGroup = vi.fn().mockResolvedValue(undefined)
	const onDeleteGroup = vi.fn().mockResolvedValue(undefined)

	const view = render(
		<MobileRecordingGroupSheet
			open
			onOpenChange={onOpenChange}
			groups={groups}
			selectedGroupId={ALL_RECORDING_GROUP_ID}
			totalCount={6}
			ungroupedCount={1}
			onSelect={onSelect}
			onCreateGroup={onCreateGroup}
			onRenameGroup={onRenameGroup}
			onDeleteGroup={onDeleteGroup}
			{...overrides}
		/>,
	)

	return { onSelect, onOpenChange, onCreateGroup, onRenameGroup, onDeleteGroup, ...view }
}

describe("MobileRecordingGroupSheet", () => {
	it("selects real and virtual groups from menu view", () => {
		const { onSelect, onOpenChange } = renderGroupSheet()

		fireEvent.click(screen.getByTestId("mobile-recording-group-option-ungrouped"))

		expect(onSelect).toHaveBeenCalledWith(UNGROUPED_RECORDING_GROUP_ID)
		expect(onOpenChange).toHaveBeenCalledWith(false)
	})

	it("selects a custom group from menu view", () => {
		const { onSelect } = renderGroupSheet()

		fireEvent.click(screen.getAllByTestId("mobile-recording-group-option")[0])

		expect(onSelect).toHaveBeenCalledWith("workspace-audio-001")
	})

	it("renders the selected checkmark before the group label", () => {
		renderGroupSheet({ selectedGroupId: ALL_RECORDING_GROUP_ID })

		const allRow = screen.getByTestId("mobile-recording-group-option-all")
		const label = screen.getByText("All")
		const check = allRow.querySelector("svg")

		expect(check).not.toBeNull()
		expect(
			allRow.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
	})

	it("does not expose manage groups entry in menu view", () => {
		renderGroupSheet()

		expect(screen.queryByTestId("mobile-recording-group-manage-trigger")).toBeNull()
	})

	it("shows more buttons only for editable custom groups", () => {
		renderGroupSheet()

		expect(screen.queryAllByTestId("mobile-recording-group-more-button")).toHaveLength(2)
		expect(
			screen
				.getByTestId("mobile-recording-group-option-all")
				.parentElement?.querySelector('[data-testid="mobile-recording-group-more-button"]'),
		).toBeNull()
		expect(
			screen
				.getByTestId("mobile-recording-group-option-ungrouped")
				.parentElement?.querySelector('[data-testid="mobile-recording-group-more-button"]'),
		).toBeNull()
	})

	it("does not select a group when opening the row more menu", () => {
		const { onSelect } = renderGroupSheet()

		fireEvent.click(screen.getAllByTestId("mobile-recording-group-more-button")[0])

		expect(onSelect).not.toHaveBeenCalled()
		expect(screen.getByTestId("mobile-recording-group-rename-trigger")).toBeInTheDocument()
	})

	it("opens rename and delete actions from the row more menu", () => {
		renderGroupSheet()

		const moreButtons = screen.getAllByTestId("mobile-recording-group-more-button")
		fireEvent.click(moreButtons[0])

		expect(screen.getByTestId("mobile-recording-group-rename-trigger")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-recording-group-delete-trigger")).toBeInTheDocument()
	})

	it("creates a group and returns to the menu view", async () => {
		const { onCreateGroup } = renderGroupSheet()

		fireEvent.click(screen.getByTestId("mobile-recording-group-create-trigger"))
		fireEvent.change(screen.getByTestId("mobile-recording-group-create-input"), {
			target: { value: "Mock new group" },
		})
		fireEvent.click(screen.getByTestId("mobile-recording-group-create-confirm"))

		await waitFor(() => {
			expect(onCreateGroup).toHaveBeenCalledWith("Mock new group")
		})
		expect(screen.getByTestId("mobile-recording-group-create-trigger")).toBeInTheDocument()
		expect(screen.queryByTestId("mobile-recording-group-create-input")).toBeNull()
	})

	it("renames a group and returns to the menu view", async () => {
		const { onRenameGroup } = renderGroupSheet()

		fireEvent.click(screen.getAllByTestId("mobile-recording-group-more-button")[0])
		fireEvent.click(screen.getByTestId("mobile-recording-group-rename-trigger"))
		fireEvent.change(screen.getByTestId("mobile-recording-group-rename-input"), {
			target: { value: "Mock renamed group" },
		})
		fireEvent.click(screen.getByTestId("mobile-recording-group-rename-confirm"))

		await waitFor(() => {
			expect(onRenameGroup).toHaveBeenCalledWith(
				"workspace-audio-001",
				"Mock renamed group",
			)
		})
		expect(screen.getByTestId("mobile-recording-group-create-trigger")).toBeInTheDocument()
	})

	it("navigates back from group actions and nested views", () => {
		renderGroupSheet()

		fireEvent.click(screen.getAllByTestId("mobile-recording-group-more-button")[0])
		expect(screen.getByTestId("mobile-recording-group-rename-trigger")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("mobile-recording-group-sheet-back"))
		expect(screen.getByTestId("mobile-recording-group-create-trigger")).toBeInTheDocument()

		fireEvent.click(screen.getAllByTestId("mobile-recording-group-more-button")[0])
		fireEvent.click(screen.getByTestId("mobile-recording-group-rename-trigger"))
		fireEvent.click(screen.getByTestId("mobile-recording-group-sheet-back"))
		expect(screen.getByTestId("mobile-recording-group-rename-trigger")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("mobile-recording-group-delete-trigger"))
		fireEvent.click(screen.getByTestId("mobile-recording-group-sheet-back"))
		expect(screen.getByTestId("mobile-recording-group-delete-trigger")).toBeInTheDocument()
	})

	it("resets to menu view after closing and reopening", () => {
		const { unmount } = renderGroupSheet()

		fireEvent.click(screen.getByTestId("mobile-recording-group-create-trigger"))
		fireEvent.click(screen.getByTestId("mobile-recording-group-sheet-back"))
		fireEvent.click(screen.getByTestId("mobile-recording-group-sheet-close"))

		unmount()
		renderGroupSheet()

		expect(screen.getByTestId("mobile-recording-group-create-trigger")).toBeInTheDocument()
		expect(screen.queryByTestId("mobile-recording-group-create-input")).toBeNull()
	})

	it("disables create confirm while submitting", () => {
		renderGroupSheet({ isSubmitting: true })

		fireEvent.click(screen.getByTestId("mobile-recording-group-create-trigger"))

		expect(screen.getByTestId("mobile-recording-group-create-confirm")).toBeDisabled()
	})

	it("disables create confirm when draft is empty", () => {
		renderGroupSheet()

		fireEvent.click(screen.getByTestId("mobile-recording-group-create-trigger"))

		expect(screen.getByTestId("mobile-recording-group-create-confirm")).toBeDisabled()
	})

	it("confirms delete through the deleteConfirm view", async () => {
		const { onDeleteGroup } = renderGroupSheet()

		fireEvent.click(screen.getAllByTestId("mobile-recording-group-more-button")[0])
		fireEvent.click(screen.getByTestId("mobile-recording-group-delete-trigger"))

		expect(
			screen.getByText(
				'Delete "Mock work group"? Recordings in it will be moved to Ungrouped.',
			),
		).toBeInTheDocument()
		expect(screen.getByTestId("mobile-recording-group-delete-confirm")).toHaveAttribute(
			"data-tone",
			"destructive",
		)

		fireEvent.click(screen.getByTestId("mobile-recording-group-delete-confirm"))

		await waitFor(() => {
			expect(onDeleteGroup).toHaveBeenCalledWith("workspace-audio-001")
		})
	})

	it("shows a fallback label when a group name is empty", () => {
		renderGroupSheet({
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

	it("lists ungrouped before custom groups in menu view", () => {
		renderGroupSheet()

		const orderedTestIds = [
			"mobile-recording-group-option-all",
			"mobile-recording-group-option-ungrouped",
			"mobile-recording-group-option",
		]
		const renderedOrder = orderedTestIds.flatMap((testId) =>
			screen.queryAllByTestId(testId).map(() => testId),
		)

		expect(renderedOrder.indexOf("mobile-recording-group-option-all")).toBeLessThan(
			renderedOrder.indexOf("mobile-recording-group-option-ungrouped"),
		)
		expect(renderedOrder.indexOf("mobile-recording-group-option-ungrouped")).toBeLessThan(
			renderedOrder.lastIndexOf("mobile-recording-group-option"),
		)
	})
})
