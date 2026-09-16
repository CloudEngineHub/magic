import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { AttachmentItem } from "../hooks/types"
import type { ReactNode } from "react"
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
	ProjectFileImageThumbnailIcon: ({
		item,
		fallback,
	}: {
		item: AttachmentItem
		fallback?: ReactNode
	}) =>
		item.file_extension === "png" ? (
			<span data-testid="project-file-image-thumbnail" data-file-id={item.file_id} />
		) : (
			fallback
		),
}))

vi.mock("@/components/base/MagicFileIcon", () => ({
	default: ({ type }: { type?: string }) => (
		<span data-testid="mobile-attachment-magic-file-icon" data-icon-type={type} />
	),
}))

vi.mock("./SlidesTemplateFolderIcon", () => ({
	SlidesTemplateFolderIcon: () => <span data-testid="slides-template-icon" />,
}))

describe("MobileAttachmentRowIcon", () => {
	it.each(["micro-app", "html-app"])("preserves configured icons for %s projects", (type) => {
		const item: AttachmentItem = {
			file_id: "app-folder",
			name: "App",
			is_directory: true,
			display_config: { type, icon: "icon.png" },
			children: [{ file_id: "icon", name: "icon.png", file_extension: "png" }],
		}
		render(<MobileAttachmentRowIcon item={item} attachments={[item]} />)
		expect(screen.getByTestId("mobile-attachment-custom-folder-icon")).toHaveAttribute(
			"data-children-count",
			"1",
		)
	})

	it("uses the dedicated template icon through shared file presentation", () => {
		const item: AttachmentItem = {
			file_id: "template",
			name: "Template",
			is_directory: true,
			display_config: { type: "slide-template" },
		}
		render(<MobileAttachmentRowIcon item={item} attachments={[item]} />)
		expect(screen.getByTestId("slides-template-icon")).toBeInTheDocument()
	})

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
