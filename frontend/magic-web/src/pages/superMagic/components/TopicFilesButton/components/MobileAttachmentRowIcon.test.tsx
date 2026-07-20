import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { AttachmentItem } from "../hooks/types"
import { MobileAttachmentRowIcon } from "./MobileAttachmentRowIcon"

vi.mock("./CustomFolderMagicIcon", () => ({
	CustomFolderMagicIcon: ({ childrenItems }: { childrenItems?: Array<unknown> }) => (
		<span
			data-testid="mobile-attachment-custom-folder-icon"
			data-children-count={childrenItems?.length ?? 0}
		/>
	),
}))

vi.mock("./ProjectFileImageThumbnailIcon", () => ({
	ProjectFileImageThumbnailIcon: ({ item }: { item: AttachmentItem }) => (
		<span data-testid="project-file-image-thumbnail" data-file-id={item.file_id} />
	),
}))

vi.mock("@/components/base/MagicFileIcon", () => ({
	default: ({ type }: { type?: string }) => (
		<span data-testid="mobile-attachment-magic-file-icon" data-icon-type={type} />
	),
}))

vi.mock("../utils/magic-system-folder", () => ({
	isMagicSystemFolder: vi.fn(() => false),
}))

describe("MobileAttachmentRowIcon", () => {
	it("uses the full attachment tree when a custom folder item is missing children", () => {
		const customFolderSummary: AttachmentItem = {
			file_id: "file-special-folder",
			name: "fictional-special-folder",
			is_directory: true,
			display_config: {
				type: "custom",
				icon: "assets/icon.png",
			},
		}
		const attachments: AttachmentItem[] = [
			{
				...customFolderSummary,
				children: [
					{
						file_id: "file-icon",
						name: "icon.png",
						file_extension: "png",
						is_directory: false,
					},
				],
			},
		]

		render(<MobileAttachmentRowIcon item={customFolderSummary} attachments={attachments} />)

		expect(screen.getByTestId("mobile-attachment-custom-folder-icon")).toHaveAttribute(
			"data-children-count",
			"1",
		)
	})

	it("renders image files through the thumbnail component", () => {
		const imageItem: AttachmentItem = {
			file_id: "file-image",
			name: "cover.png",
			file_extension: "png",
			file_url: "https://cdn.example.com/cover.png",
		}

		render(<MobileAttachmentRowIcon item={imageItem} attachments={[]} />)

		expect(screen.getByTestId("project-file-image-thumbnail")).toHaveAttribute(
			"data-file-id",
			"file-image",
		)
	})
})
