import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import ProjectShareFilePicker from "../components/ProjectShareFilePicker"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/pages/superMagicMobile/components/CommonPopup", () => ({
	default: ({
		children,
		popupProps,
	}: {
		children: ReactNode
		popupProps?: { visible?: boolean }
	}) => (popupProps?.visible ? <div data-testid="mock-share-file-popup">{children}</div> : null),
}))

vi.mock("@/components/base-mobile/ScrollEdgeFade", () => ({
	ScrollEdgeFadeContainer: ({ children }: { children: ReactNode }) => (
		<div data-testid="mock-share-file-scroll">{children}</div>
	),
}))

vi.mock("@/pages/superMagicMobile/components/MobileBottomSearchBar", () => ({
	default: ({
		value,
		placeholder,
		onValueChange,
		testIdPrefix,
	}: {
		value: string
		placeholder: string
		onValueChange: (value: string) => void
		testIdPrefix: string
	}) => (
		<input
			value={value}
			placeholder={placeholder}
			data-testid={`${testIdPrefix}-input`}
			onChange={(event) => onValueChange(event.target.value)}
		/>
	),
}))

vi.mock("@/pages/superMagicMobile/components/DataEmptyState", () => ({
	DataEmptyState: () => <div data-testid="mock-share-file-empty" />,
}))

vi.mock(
	"@/pages/superMagic/components/TopicFilesButton/components/MobileAttachmentRowIcon",
	() => ({
		MobileAttachmentRowIcon: ({ item }: { item: { name?: string } }) => (
			<span data-testid="mock-share-file-icon">{item.name}</span>
		),
	}),
)

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
		<button {...props}>{children}</button>
	),
}))

const attachments = [
	{
		file_id: "fictional-folder",
		name: "Fictional Folder",
		is_directory: true,
		children: [
			{
				file_id: "fictional-file-a",
				name: "Fictional A.md",
				file_extension: "md",
				is_directory: false,
			},
			{
				file_id: "fictional-file-b",
				name: "Fictional B.html",
				file_extension: "html",
				is_directory: false,
			},
		],
	},
	{
		file_id: "fictional-file-c",
		name: "Fictional C.txt",
		file_extension: "txt",
		is_directory: false,
	},
]

const legacyIdAttachments = [
	{
		id: "fictional-legacy-file",
		name: "Fictional Legacy.txt",
		file_extension: "txt",
		is_directory: false,
	},
] as AttachmentItem[]

describe("ProjectShareFilePicker", () => {
	it("uses the default-file navigation shell and commits multi-selection", () => {
		const onClose = vi.fn()
		const onConfirm = vi.fn()

		render(
			<ProjectShareFilePicker
				open
				attachments={attachments}
				selectedFileIds={["fictional-file-a"]}
				defaultOpenFileId="fictional-file-a"
				onClose={onClose}
				onConfirm={onConfirm}
			/>,
		)

		expect(screen.getByText("share.selectShareFiles")).toBeInTheDocument()
		expect(screen.getByTestId("project-share-file-picker-breadcrumb")).toBeInTheDocument()
		expect(screen.getByTestId("project-share-file-picker-search-input")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("project-share-file-picker-primary-fictional-folder"))
		expect(
			screen.getByTestId("project-share-file-picker-primary-fictional-file-b"),
		).toBeInTheDocument()
		expect(screen.getByText("Fictional Folder")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("project-share-file-picker-toggle-fictional-file-b"))
		fireEvent.click(screen.getByTestId("project-share-file-picker-confirm"))

		expect(onConfirm).toHaveBeenCalledWith(["fictional-file-a", "fictional-file-b"])
		expect(onClose).not.toHaveBeenCalled()
	})

	it("searches the full tree and keeps the result path visible", () => {
		render(
			<ProjectShareFilePicker
				open
				attachments={attachments}
				selectedFileIds={["fictional-file-a"]}
				onClose={vi.fn()}
				onConfirm={vi.fn()}
			/>,
		)

		fireEvent.change(screen.getByTestId("project-share-file-picker-search-input"), {
			target: { value: "Fictional B" },
		})

		expect(
			screen.getByTestId("project-share-file-picker-primary-fictional-file-b"),
		).toBeInTheDocument()
		expect(screen.getByText("Fictional Folder")).toBeInTheDocument()
	})

	// Verifies that the precomputed state map preserves partial-folder promotion semantics.
	it("promotes an indeterminate folder selection without retaining descendant ids", () => {
		const onConfirm = vi.fn()

		render(
			<ProjectShareFilePicker
				open
				attachments={attachments}
				selectedFileIds={["fictional-file-a"]}
				onClose={vi.fn()}
				onConfirm={onConfirm}
			/>,
		)

		const folderToggle = screen.getByTestId("project-share-file-picker-toggle-fictional-folder")
		expect(folderToggle.querySelector(".lucide-minus")).toBeInTheDocument()

		fireEvent.click(folderToggle)
		fireEvent.click(screen.getByTestId("project-share-file-picker-confirm"))

		expect(onConfirm).toHaveBeenCalledWith(["fictional-folder"])
	})

	it("selects legacy id-only attachments through the shared index", () => {
		const onConfirm = vi.fn()

		render(
			<ProjectShareFilePicker
				open
				attachments={legacyIdAttachments}
				selectedFileIds={[]}
				onClose={vi.fn()}
				onConfirm={onConfirm}
			/>,
		)

		fireEvent.click(
			screen.getByTestId("project-share-file-picker-toggle-fictional-legacy-file"),
		)
		fireEvent.click(screen.getByTestId("project-share-file-picker-confirm"))

		expect(onConfirm).toHaveBeenCalledWith(["fictional-legacy-file"])
	})
})
