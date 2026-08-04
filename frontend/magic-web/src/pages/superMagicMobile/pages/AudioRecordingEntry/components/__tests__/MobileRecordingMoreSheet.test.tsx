import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { AudioProjectListItem } from "@/types/audioProject"
import { MobileRecordingMoreSheet } from "../MobileRecordingMoreSheet"
import { toast } from "sonner"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"audioRecordings:card.openProject": "View recording project",
				"super:mobile.recordingEntry.moreSheet.moveToGroup": "Move to group",
				"super:mobile.recordingEntry.moreSheet.generateSummary": "Generate summary",
				"super:mobile.recordingEntry.moreSheet.regenerateSummary": "Regenerate summary",
				"super:mobile.recordingEntry.moreSheet.share": "Share",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("sonner", () => ({
	toast: {
		info: vi.fn(),
	},
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({}),
	getAdminLocaleModules: () => ({}),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/utils/audio-recordings-utils", () => ({
	resolveRecordingDisplayName: (name: string) => name,
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
		visible ? <div data-testid="mock-magic-popup">{children}</div> : null,
}))

function createItem(overrides: Partial<AudioProjectListItem> = {}): AudioProjectListItem {
	return {
		id: "project-move-target",
		project_name: "Mock movable recording",
		created_at: 1710000000,
		duration: 120,
		tags: [],
		device_id: "",
		audio_source: "recorded",
		current_phase: "summarizing",
		phase_status: "completed",
		card_status: "summarized",
		is_summarized: true,
		...overrides,
	}
}

describe("MobileRecordingMoreSheet", () => {
	it("opens the recording project and closes the action sheet", () => {
		const onOpenProject = vi.fn()
		const onClose = vi.fn()

		render(
			<MobileRecordingMoreSheet
				isOpen
				item={createItem()}
				onClose={onClose}
				onRename={vi.fn()}
				onDelete={vi.fn()}
				onOpenProject={onOpenProject}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-more-open-project"))

		expect(onOpenProject).toHaveBeenCalledWith(
			expect.objectContaining({ id: "project-move-target" }),
		)
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("opens move-to-group flow instead of showing coming-soon toast", () => {
		const onMoveToGroup = vi.fn()
		const onClose = vi.fn()

		render(
			<MobileRecordingMoreSheet
				isOpen
				item={createItem()}
				onClose={onClose}
				onRename={vi.fn()}
				onDelete={vi.fn()}
				onMoveToGroup={onMoveToGroup}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-more-move-to-group"))

		expect(onMoveToGroup).toHaveBeenCalledWith(createItem())
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("shows summarize action for merging completed items and wires it to the caller", () => {
		const onSummarize = vi.fn()

		render(
			<MobileRecordingMoreSheet
				isOpen
				item={createItem({
					card_status: "not_summarized",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "completed",
				})}
				onClose={vi.fn()}
				onRename={vi.fn()}
				onDelete={vi.fn()}
				onSummarize={onSummarize}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-more-summarize"))

		expect(onSummarize).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "project-move-target",
				current_phase: "merging",
				phase_status: "completed",
			}),
		)
	})

	it("shows retry summary action for failed summarizing items", () => {
		const onSummarize = vi.fn()
		render(
			<MobileRecordingMoreSheet
				isOpen
				item={createItem({
					card_status: "summarizing",
					is_summarized: false,
					current_phase: "summarizing",
					phase_status: "failed",
				})}
				onClose={vi.fn()}
				onRename={vi.fn()}
				onDelete={vi.fn()}
				onSummarize={onSummarize}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-more-summarize"))
		expect(onSummarize).toHaveBeenCalledWith(
			expect.objectContaining({ id: "project-move-target" }),
		)
	})

	it("shows regenerate summary action when the recording is already summarized", () => {
		const onSummarize = vi.fn()
		render(
			<MobileRecordingMoreSheet
				isOpen
				item={createItem()}
				onClose={vi.fn()}
				onRename={vi.fn()}
				onDelete={vi.fn()}
				onSummarize={onSummarize}
				showRegenerateAction
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-more-summarize"))
		expect(onSummarize).toHaveBeenCalledWith(
			expect.objectContaining({ id: "project-move-target" }),
		)
	})

	it("hides summarize action while summarizing is already in progress", () => {
		render(
			<MobileRecordingMoreSheet
				isOpen
				item={createItem({
					card_status: "summarizing",
					is_summarized: false,
					current_phase: "summarizing",
					phase_status: "in_progress",
				})}
				onClose={vi.fn()}
				onRename={vi.fn()}
				onDelete={vi.fn()}
				onSummarize={vi.fn()}
			/>,
		)

		expect(screen.queryByTestId("mobile-recording-more-summarize")).toBeNull()
	})

	it("can hide the share action for detail pages", () => {
		render(
			<MobileRecordingMoreSheet
				isOpen
				item={createItem()}
				onClose={vi.fn()}
				onRename={vi.fn()}
				onDelete={vi.fn()}
				hideShareAction
			/>,
		)

		expect(screen.queryByText("Share")).toBeNull()
	})

	it("uses caller-provided share action instead of the coming-soon toast", () => {
		const onShare = vi.fn()
		const onClose = vi.fn()

		render(
			<MobileRecordingMoreSheet
				isOpen
				item={createItem()}
				onClose={onClose}
				onRename={vi.fn()}
				onDelete={vi.fn()}
				onShare={onShare}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-more-share"))

		expect(onShare).toHaveBeenCalledTimes(1)
		expect(onClose).toHaveBeenCalledTimes(1)
		expect(toast.info).not.toHaveBeenCalled()
	})

	it("can hide regenerate summary action for summarized items when caller does not opt in", () => {
		render(
			<MobileRecordingMoreSheet
				isOpen
				item={createItem()}
				onClose={vi.fn()}
				onRename={vi.fn()}
				onDelete={vi.fn()}
				onSummarize={vi.fn()}
			/>,
		)

		expect(screen.queryByText("Regenerate summary")).not.toBeInTheDocument()
		expect(screen.queryByTestId("mobile-recording-more-summarize")).not.toBeInTheDocument()
	})
})
