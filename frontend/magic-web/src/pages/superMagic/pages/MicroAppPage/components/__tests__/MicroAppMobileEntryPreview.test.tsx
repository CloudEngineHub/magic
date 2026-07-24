import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import MicroAppEntryPreview from "../MicroAppEntryPreview"
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

vi.mock("../MicroAppPhonePreviewFrame", () => ({
	default: ({ children }: { children: ReactNode }) => (
		<div data-testid="micro-app-phone-preview-frame">{children}</div>
	),
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

	it("shows the building animation when a topic is running without html", () => {
		render(
			<MicroAppMobileEntryPreview
				entryFile={null}
				attachments={[]}
				attachmentList={[]}
				selectedProject={null}
				allowEdit={false}
				onOpenFile={vi.fn()}
				isBuilding
			/>,
		)

		expect(screen.getByTestId("micro-app-mobile-preview-building")).toHaveTextContent(
			"microAppPage.preview.buildingTitle",
		)
		expect(screen.queryByTestId("micro-app-mobile-preview-empty")).not.toBeInTheDocument()
	})

	it("keeps the entry-empty state when a nested html already exists", () => {
		render(
			<MicroAppMobileEntryPreview
				entryFile={null}
				attachments={[]}
				attachmentList={[
					{
						file_id: "nested-html",
						file_name: "page.html",
						relative_file_path: "pages/page.html",
					},
				]}
				selectedProject={null}
				allowEdit={false}
				onOpenFile={vi.fn()}
				isBuilding
			/>,
		)

		expect(screen.getByTestId("micro-app-mobile-preview-empty")).toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-mobile-preview-building")).not.toBeInTheDocument()
	})

	it("wraps phone preview with the shared phone frame", async () => {
		render(
			<MicroAppEntryPreview
				entryFile={{ file_id: "entry-1", file_name: "index.html" }}
				attachments={[]}
				attachmentList={[]}
				selectedProject={null}
				allowEdit
				viewMode="phone"
			/>,
		)

		expect(await screen.findByTestId("micro-app-phone-preview-frame")).toBeInTheDocument()
		expect(htmlPreviewMocks.props).toEqual(
			expect.objectContaining({
				viewMode: "phone",
				showPhoneFrame: false,
			}),
		)
	})
})
