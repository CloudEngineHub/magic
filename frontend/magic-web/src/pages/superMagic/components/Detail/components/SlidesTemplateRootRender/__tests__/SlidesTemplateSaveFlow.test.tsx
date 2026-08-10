import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSlidesTemplateSaveFlow } from "../SlidesTemplateSaveFlow"
import type { SlidesTemplateManifest, SlidesTemplateProjectContext } from "../types"

const mocks = vi.hoisted(() => ({
	checkByTemplateId: vi.fn(),
	saveFromFolder: vi.fn(),
	toastInfo: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	createRandomUuidV4: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
}))

vi.mock("@/pages/superMagic/services/mySlidesTemplateAdapter", () => ({
	mySlidesTemplateAdapter: {
		enabled: true,
		checkByTemplateId: mocks.checkByTemplateId,
		saveFromFolder: mocks.saveFromFolder,
	},
	MySlidesTemplateAdapterUnavailableError: class extends Error {},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		info: mocks.toastInfo,
		success: mocks.toastSuccess,
		error: mocks.toastError,
	},
}))

vi.mock("@/utils/create-random-uuid-v4", () => ({
	createRandomUuidV4: mocks.createRandomUuidV4,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

const manifest: SlidesTemplateManifest = {
	schema_version: "1.0",
	template_id: "SLIDE-example",
	category_code: "business",
	tag_codes: ["featured"],
	label: { zh_CN: "示例模板", en_US: "Example Template" },
	description: { zh_CN: "中文描述", en_US: "English description" },
	files: { slides_dir: "slides" },
	slides: [{ file: "slides/slide-1.html", title: "One", layout: "cover", description: "First" }],
}

const project = {
	rootFileId: "folder-1",
	rootPath: "示例模板",
	root: { file_id: "folder-1", file_name: "示例模板" },
} as SlidesTemplateProjectContext

function Harness({
	onManifestSave = vi.fn(),
}: {
	onManifestSave?: (manifest: SlidesTemplateManifest) => Promise<void>
}) {
	const flow = useSlidesTemplateSaveFlow({
		manifest,
		project,
		projectId: "project-1",
		onManifestSave,
	})
	return (
		<div>
			<button type="button" onClick={() => void flow.startSave()}>
				start
			</button>
			{flow.dialogs}
		</div>
	)
}

describe("useSlidesTemplateSaveFlow", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.checkByTemplateId.mockResolvedValue({ exists: false })
		mocks.saveFromFolder.mockResolvedValue({ id: "saved", name: "Saved" })
	})

	it("saves directly when the template does not already exist", async () => {
		render(<Harness />)
		fireEvent.click(screen.getByRole("button", { name: "start" }))

		await waitFor(() =>
			expect(mocks.saveFromFolder).toHaveBeenCalledWith(
				expect.objectContaining({ mode: "create" }),
			),
		)
		expect(mocks.toastSuccess).toHaveBeenCalled()
	})

	it("offers overwrite when the template already exists", async () => {
		mocks.checkByTemplateId.mockResolvedValueOnce({
			exists: true,
			template: { id: "existing-1", name: "Existing" },
		})
		render(<Harness />)
		fireEvent.click(screen.getByRole("button", { name: "start" }))

		await screen.findByText("slidesTemplatePreview.save.existingTitle")
		fireEvent.click(
			screen.getByRole("button", { name: "slidesTemplatePreview.save.overwrite" }),
		)
		await waitFor(() =>
			expect(mocks.saveFromFolder).toHaveBeenCalledWith(
				expect.objectContaining({ mode: "overwrite", targetId: "existing-1" }),
			),
		)
	})

	it("rolls back the manifest when save-as fails", async () => {
		mocks.checkByTemplateId.mockResolvedValueOnce({
			exists: true,
			template: { id: "existing-1", name: "Existing" },
		})
		mocks.checkByTemplateId.mockResolvedValueOnce({ exists: false })
		mocks.saveFromFolder.mockRejectedValueOnce(new Error("save failed"))
		const onManifestSave = vi.fn().mockResolvedValue(undefined)
		render(<Harness onManifestSave={onManifestSave} />)
		fireEvent.click(screen.getByRole("button", { name: "start" }))
		await screen.findByText("slidesTemplatePreview.save.existingTitle")
		fireEvent.click(screen.getByRole("button", { name: "slidesTemplatePreview.save.saveAs" }))
		await screen.findByText("slidesTemplatePreview.save.saveAsTitle")
		fireEvent.click(screen.getByRole("button", { name: "slidesTemplatePreview.save.saveAs" }))

		await waitFor(() => expect(onManifestSave).toHaveBeenCalledTimes(2))
		expect(onManifestSave.mock.calls[1][0]).toEqual(manifest)
	})
})
