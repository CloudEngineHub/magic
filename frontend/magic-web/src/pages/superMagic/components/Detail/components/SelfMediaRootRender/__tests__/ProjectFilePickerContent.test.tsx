import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ProjectFilePickerContent from "../components/SelfMediaInitPanel/components/picker/ProjectFilePickerContent"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (
			key: string,
			fallbackOrOptions?: string | { count?: number; defaultValue?: string },
		) => {
			const messages: Record<string, string> = {
				"detail.selfMedia.initPanel.referenceFilePicker.alreadySelected": "Selected",
				"detail.selfMedia.initPanel.referenceFilePicker.confirmAdd": "Add selected",
				"detail.selfMedia.initPanel.referenceFilePicker.emptyProjectFiles":
					"No project files yet",
				"detail.selfMedia.initPanel.referenceFilePicker.localUpload": "Upload local file",
				"detail.selfMedia.initPanel.referenceFilePicker.multiSelectHint":
					"Select multiple files to confirm, or drag to the target area.",
				"detail.selfMedia.initPanel.referenceFilePicker.noMatches": "No matching files",
				"detail.selfMedia.initPanel.referenceFilePicker.pasteOrDrag": "or paste / drag",
				"detail.selfMedia.initPanel.referenceFilePicker.searchPlaceholder":
					"Search files...",
				"detail.selfMedia.initPanel.referenceFilePicker.unnamedFile": "Untitled file",
			}

			if (key === "detail.selfMedia.initPanel.referenceFilePicker.pendingSelection") {
				return `${fallbackOrOptions && typeof fallbackOrOptions !== "string" ? fallbackOrOptions.count : 0} selected`
			}

			return (
				messages[key] || (typeof fallbackOrOptions === "string" ? fallbackOrOptions : key)
			)
		},
	}),
}))

describe("ProjectFilePickerContent", () => {
	it("renders localized in-flow hints for file selection feedback", () => {
		render(
			<ProjectFilePickerContent
				files={[
					{
						file_id: "file-a",
						file_name: "",
						display_filename: "",
						relative_file_path: "docs/a.md",
					},
					{
						file_id: "file-b",
						file_name: "notes.md",
						relative_file_path: "docs/notes.md",
					},
				]}
				loading={false}
				searchQuery=""
				onSearchChange={vi.fn()}
				onSelect={vi.fn()}
				selectedPaths={new Set(["docs/a.md"])}
				onLocalUpload={vi.fn()}
				multiSelect
				pendingIds={new Set(["file-b"])}
				onToggle={vi.fn()}
				onConfirm={vi.fn()}
				pendingCount={2}
			/>,
		)

		expect(screen.getByPlaceholderText("Search files...")).toBeInTheDocument()
		expect(screen.getByText("Upload local file")).toBeInTheDocument()
		expect(screen.getByText("or paste / drag")).toBeInTheDocument()
		expect(screen.getByText("Untitled file")).toBeInTheDocument()
		expect(screen.getByText("Selected")).toBeInTheDocument()
		expect(screen.getByText("2 selected")).toBeInTheDocument()
		expect(screen.getByRole("button", { name: /Add selected/ })).toBeInTheDocument()
		expect(screen.queryByText("搜索文件...")).not.toBeInTheDocument()
	})

	it("renders localized empty states for project file search", () => {
		const { rerender } = render(
			<ProjectFilePickerContent
				files={[]}
				loading={false}
				searchQuery="missing"
				onSearchChange={vi.fn()}
				onSelect={vi.fn()}
				selectedPaths={new Set()}
			/>,
		)

		expect(screen.getByText("No matching files")).toBeInTheDocument()

		rerender(
			<ProjectFilePickerContent
				files={[]}
				loading={false}
				searchQuery=""
				onSearchChange={vi.fn()}
				onSelect={vi.fn()}
				selectedPaths={new Set()}
			/>,
		)

		expect(screen.getByText("No project files yet")).toBeInTheDocument()
	})
})
