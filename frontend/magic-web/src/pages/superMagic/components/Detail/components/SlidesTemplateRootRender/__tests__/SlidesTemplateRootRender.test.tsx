import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import SlidesTemplateRootRender from "../index"

const mocks = vi.hoisted(() => ({
	getFileContentById: vi.fn(),
	rootProps: vi.fn(),
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentById: mocks.getFileContentById,
}))

vi.mock("../../PPTRootRender", () => ({
	default: (props: Record<string, unknown>) => {
		mocks.rootProps(props)
		return <div data-testid="ppt-root-render" />
	},
}))

vi.mock("@/components/base/MagicSpin", () => ({
	default: () => <div data-testid="loading" />,
}))

vi.mock("react-i18next", async (importOriginal) => ({
	...(await importOriginal<typeof import("react-i18next")>()),
	useTranslation: () => ({ t: (key: string) => key }),
}))

describe("SlidesTemplateRootRender", () => {
	it("loads template.json and passes a slide model to PPTRootRender", async () => {
		mocks.getFileContentById.mockResolvedValue(
			JSON.stringify({
				schema_version: "1.0",
				files: { slides_dir: "slides" },
				slides: [
					{
						file: "slides/slide-1.html",
						title: "One",
						layout: "cover",
						description: "First",
					},
				],
			}),
		)

		render(
			<SlidesTemplateRootRender
				data={
					{
						file_id: "root",
						file_name: "PPT-template",
						is_directory: true,
						relative_file_path: "PPT-template",
						children: [
							{ file_id: "manifest", file_name: "template.json" },
							{ file_id: "spec", file_name: "visual-spec.md" },
							{ file_id: "theme", file_name: "theme.css" },
							{
								file_id: "slides-dir",
								file_name: "slides",
								is_directory: true,
								children: [{ file_id: "slide-1", file_name: "slide-1.html" }],
							},
						],
					} as never
				}
				projectId="project-1"
			/>,
		)

		expect(await screen.findByTestId("ppt-root-render")).toBeInTheDocument()
		await waitFor(() => {
			expect(mocks.rootProps).toHaveBeenCalledWith(
				expect.objectContaining({
					disableMagicProjectLookup: true,
					displayConfig: {
						type: "slide",
						slides: ["slides/slide-1.html"],
					},
					slideStructureAdapter: expect.any(Object),
				}),
			)
		})
	})
})
