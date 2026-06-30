import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ReferenceFilePicker from "../components/SelfMediaInitPanel/components/picker/ReferenceFilePicker"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (key: string, fallbackOrOptions?: string | { count?: number; name?: string }) => {
			const messages: Record<string, string> = {
				"detail.selfMedia.initPanel.referenceFilePicker.addedCount": "1 reference added",
				"detail.selfMedia.initPanel.referenceFilePicker.hint":
					"Optional. All file formats supported",
				"detail.selfMedia.initPanel.referenceFilePicker.localUpload": "Upload local file",
				"detail.selfMedia.initPanel.referenceFilePicker.projectFile": "Project file",
				"detail.selfMedia.initPanel.referenceFilePicker.removeFile": "Remove brief.md",
			}

			return (
				messages[key] || (typeof fallbackOrOptions === "string" ? fallbackOrOptions : key)
			)
		},
	}),
}))

vi.mock("@/stores/projectFiles", () => ({
	default: {
		workspaceFilesList: [],
	},
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentById: vi.fn(),
}))

describe("ReferenceFilePicker", () => {
	it("turns the passive reference hint into subtle added feedback after selection", () => {
		const { rerender } = render(<ReferenceFilePicker value={[]} onChange={vi.fn()} />)

		expect(screen.getByText("Optional. All file formats supported")).toBeInTheDocument()
		expect(screen.queryByText("1 reference added")).not.toBeInTheDocument()

		rerender(
			<ReferenceFilePicker
				value={[{ name: "brief.md", content: "content", kind: "text" }]}
				onChange={vi.fn()}
			/>,
		)

		expect(screen.getByText("1 reference added")).toBeInTheDocument()
		expect(screen.queryByText("Optional. All file formats supported")).not.toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Remove brief.md" })).toBeInTheDocument()
	})
})
