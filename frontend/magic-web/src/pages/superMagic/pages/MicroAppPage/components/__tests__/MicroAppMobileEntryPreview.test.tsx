import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import MicroAppMobileEntryPreview from "../MicroAppMobileEntryPreview"

const htmlPreviewMocks = vi.hoisted(() => ({
	props: null as Record<string, unknown> | null,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/pages/superMagic/components/Detail/contents/HTML", () => ({
	default: (props: Record<string, unknown>) => {
		htmlPreviewMocks.props = props
		return <div data-testid="mobile-entry-html-preview" />
	},
}))

describe("MicroAppMobileEntryPreview", () => {
	beforeEach(() => {
		htmlPreviewMocks.props = null
	})

	it("renders the entry html directly without file viewer chrome", async () => {
		const onOpenFile = vi.fn()
		render(
			<MicroAppMobileEntryPreview
				entryFile={{
					file_id: "entry-1",
					file_name: "index.html",
					updated_at: "2026-07-20T06:00:00Z",
				}}
				attachments={[]}
				attachmentList={[]}
				selectedProject={null}
				allowEdit
				onOpenFile={onOpenFile}
			/>,
		)

		expect(await screen.findByTestId("mobile-entry-html-preview")).toBeInTheDocument()
		expect(htmlPreviewMocks.props).toEqual(
			expect.objectContaining({
				activeFileId: "entry-1",
				updatedAt: "2026-07-20T06:00:00Z",
				allowEdit: true,
				showFileHeader: false,
				showFooter: false,
				viewMode: "desktop",
				openFileTab: onOpenFile,
				data: expect.objectContaining({
					file_id: "entry-1",
					file_name: "index.html",
					file_extension: "html",
				}),
			}),
		)
	})

	it("shows the existing empty state when no entry html exists", () => {
		render(
			<MicroAppMobileEntryPreview
				entryFile={null}
				attachments={[]}
				attachmentList={[]}
				selectedProject={null}
				allowEdit={false}
				onOpenFile={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("micro-app-mobile-preview-empty")).toHaveTextContent(
			"microAppPage.preview.emptyTitle",
		)
	})
})
