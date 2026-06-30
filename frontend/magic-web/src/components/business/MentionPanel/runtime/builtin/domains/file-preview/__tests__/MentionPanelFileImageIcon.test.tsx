import { fireEvent, render, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { I18nTexts } from "../../../../../i18n/types"
import { MentionItemType } from "../../../../../types"
import { MentionPanelFileImageIcon } from "../MentionPanelFileImageIcon"

vi.mock("@/components/base/MagicFileIcon", () => ({
	default: ({ type, size }: { type: string; size: number }) => (
		<span data-testid="magic-file-icon" data-size={size} data-type={type} />
	),
}))

vi.mock("@/stores/projectFiles", () => ({
	default: {
		workspaceFilesList: [],
		getFolderData: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/components/TopicFilesButton/components/CustomFolderMagicIcon", () => ({
	CustomFolderMagicIcon: () => <span data-testid="custom-folder-icon" />,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/MessageAttachment/utils", () => ({
	getFileTreeIconType: vi.fn(() => ""),
}))

describe("MentionPanelFileImageIcon", () => {
	it("keeps loaded image previews inside a fixed desktop icon box", async () => {
		const { container } = render(
			<MentionPanelFileImageIcon
				context={{
					item: {
						id: "image-1",
						type: MentionItemType.PROJECT_FILE,
						name: "portrait.png",
						icon: "png",
						data: {
							file_id: "file-1",
							file_name: "portrait.png",
							file_path: "assets/portrait.png",
							file_extension: "png",
						},
					},
					t: {} as I18nTexts,
					platform: "desktop",
					filePreviewById: {
						"file-1": "https://example.com/portrait.png",
					},
				}}
			/>,
		)

		const loadingImage = container.querySelector("img")
		expect(loadingImage).not.toBeNull()
		fireEvent.load(loadingImage as HTMLImageElement)

		await waitFor(() => {
			const loadedImage = container.querySelector("img")
			expect(loadedImage).toHaveClass("block", "h-full", "w-full", "object-cover")
			expect(loadedImage?.parentElement).toHaveStyle({
				width: "16px",
				height: "16px",
				minWidth: "16px",
				minHeight: "16px",
				maxWidth: "16px",
				maxHeight: "16px",
			})
		})
	})
})
