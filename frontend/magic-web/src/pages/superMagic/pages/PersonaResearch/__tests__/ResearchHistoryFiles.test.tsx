import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { store, previewOpen, filesButtonProps } = vi.hoisted(() => ({
	store: {
		selectedProject: { id: "project-1" } as { id: string } | null,
		selectedTopic: null,
		isReadOnly: false,
		attachments: [{ file_id: "tree" }],
		attachmentList: [{ file_id: "list" }],
		projectFilesStore: { tag: "research-files-store" },
		personaById: vi.fn(),
	},
	previewOpen: vi.fn(),
	filesButtonProps: { current: null as Record<string, unknown> | null },
}))

vi.mock("react-i18next", async (importOriginal) => ({
	...(await importOriginal<typeof import("react-i18next")>()),
	useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }))
vi.mock("../context", () => ({ usePersonaResearchStore: () => store }))
vi.mock("@/pages/superMagic/components/TopicFilesButton", () => ({
	default: (props: Record<string, unknown>) => {
		filesButtonProps.current = props
		return <div data-testid="files-tree" />
	},
}))
vi.mock("@/pages/superMagicMobile/components/PreviewDetailPopup", async () => {
	const { forwardRef, useImperativeHandle } = await import("react")
	return {
		default: forwardRef((_props: unknown, ref) => {
			useImperativeHandle(ref, () => ({ open: previewOpen }))
			return null
		}),
	}
})
vi.mock("../components/PersonaDetailSheet", () => ({
	default: ({ persona }: { persona: { name: string } | null }) =>
		persona ? <div data-testid="persona-dialog">{persona.name}</div> : null,
}))
vi.mock("../components/ResearchStateView", () => ({
	default: () => <div data-testid="loading" />,
}))

const { default: ResearchHistoryFiles } = await import("../components/ResearchHistoryFiles")

const onOpenChange = vi.fn()
const clickFile = (file: unknown) =>
	act(() => (filesButtonProps.current?.onFileClick as (file: unknown) => void)(file))

beforeEach(() => {
	store.selectedProject = { id: "project-1" }
	onOpenChange.mockClear()
	previewOpen.mockClear()
	store.personaById.mockReset()
})
afterEach(cleanup)

describe("ResearchHistoryFiles", () => {
	it("renders nothing while closed", () => {
		render(<ResearchHistoryFiles open={false} onOpenChange={onOpenChange} />)
		expect(screen.queryByTestId("persona-research-history-files")).toBeNull()
	})

	it("lists the whole research project from the research store's own file data", () => {
		render(<ResearchHistoryFiles open onOpenChange={onOpenChange} />)
		expect(screen.getByTestId("persona-research-history-files")).toBeTruthy()
		expect(filesButtonProps.current).toMatchObject({
			projectId: "project-1",
			projectFilesStore: store.projectFilesStore,
			attachments: store.attachments,
			selectedTopic: null,
			allowEdit: true,
			allowDownload: true,
		})
	})

	it("shows a loading state until the project is known", () => {
		store.selectedProject = null
		render(<ResearchHistoryFiles open onOpenChange={onOpenChange} />)
		expect(screen.getByTestId("loading")).toBeTruthy()
		expect(screen.queryByTestId("files-tree")).toBeNull()
	})

	it("previews a clicked file in the floating layer with the store's attachments", () => {
		render(<ResearchHistoryFiles open onOpenChange={onOpenChange} />)
		clickFile({
			file_id: "f1",
			file_name: "report.html",
			file_extension: "html",
			relative_file_path: "studies/a/report.html",
		})
		expect(previewOpen).toHaveBeenCalledTimes(1)
		const [detail, tree, list] = previewOpen.mock.calls[0]
		expect(detail).toMatchObject({ currentFileId: "f1" })
		expect(tree).toBe(store.attachments)
		expect(list).toBe(store.attachmentList)
		expect(onOpenChange).not.toHaveBeenCalled()
	})

	it("ignores folders", () => {
		render(<ResearchHistoryFiles open onOpenChange={onOpenChange} />)
		clickFile({ file_id: "d1", file_name: "studies", is_directory: true })
		expect(previewOpen).not.toHaveBeenCalled()
	})

	it("opens a library persona in its own dialog instead of raw JSON", () => {
		store.personaById.mockReturnValue({ name: "Chen" })
		render(<ResearchHistoryFiles open onOpenChange={onOpenChange} />)
		clickFile({
			file_id: "p1",
			file_name: "p_chen.json",
			file_extension: "json",
			relative_file_path: "personas/p_chen.json",
		})
		expect(store.personaById).toHaveBeenCalledWith("p_chen")
		expect(screen.getByTestId("persona-dialog").textContent).toBe("Chen")
		expect(previewOpen).not.toHaveBeenCalled()
	})

	it("closes from the close button and with Escape", () => {
		render(<ResearchHistoryFiles open onOpenChange={onOpenChange} />)
		fireEvent.click(screen.getByRole("button", { name: "historyFiles.close" }))
		expect(onOpenChange).toHaveBeenLastCalledWith(false)
		onOpenChange.mockClear()
		fireEvent.keyDown(screen.getByTestId("files-tree"), { key: "Escape" })
		expect(onOpenChange).toHaveBeenCalledWith(false)
	})
})
