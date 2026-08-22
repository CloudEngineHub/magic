import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FileTabMagicIcon } from "../FileTabMagicIcon"

vi.mock("@/components/base/MagicFileIcon", () => ({
	default: ({ type }: { type?: string }) => <span data-testid="magic-file-icon">{type}</span>,
}))

vi.mock("@/pages/superMagic/components/TopicFilesButton/components/CustomFolderMagicIcon", () => ({
	CustomFolderMagicIcon: () => <span data-testid="custom-folder-icon" />,
}))

vi.mock(
	"@/pages/superMagic/components/TopicFilesButton/components/SlidesTemplateFolderIcon",
	() => ({
		SlidesTemplateFolderIcon: ({ size }: { size: number }) => (
			<span data-testid="slides-template-folder-icon">{size}</span>
		),
	}),
)

vi.mock("../../utils/websiteTabs", () => ({
	isWebsiteTab: () => false,
}))

describe("FileTabMagicIcon", () => {
	it("uses the template icon for slide-template tabs instead of the unknown file fallback", () => {
		render(
			<FileTabMagicIcon
				tab={
					{
						fileData: { display_config: { type: "slide-template" } },
					} as never
				}
				attachments={[]}
				isPlayback={false}
				size={16}
			/>,
		)

		expect(screen.getByTestId("slides-template-folder-icon")).toHaveTextContent("16")
		expect(screen.queryByTestId("magic-file-icon")).not.toBeInTheDocument()
	})
})
