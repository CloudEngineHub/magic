import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { RecordingSummaryContent } from "../RecordingSummaryContent"
import type { RecordingDetailFileRef } from "../../../types/recording-detail"

const magicMarkmapPropsMock = vi.hoisted(() => vi.fn())

vi.mock("@/components/base/MagicMarkmap", () => ({
	default: (props: Record<string, unknown>) => {
		magicMarkmapPropsMock(props)
		return <div data-testid="magic-markmap-mock" />
	},
}))

vi.mock("@/pages/superMagic/components/Detail/contents/HTML/IsolatedHTMLRenderer", () => ({
	default: () => <div data-testid="isolated-html-renderer-mock" />,
}))

vi.mock("@/pages/superMagic/components/Detail/contents/HTML/htmlProcessor", () => ({
	processHtmlContent: vi.fn(),
}))

vi.mock("../RecordingMarkdownContent", () => ({
	RecordingMarkdownContent: () => <div data-testid="recording-markdown-mock" />,
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
		}),
	}
})

const mindmapFile: RecordingDetailFileRef = {
	type: "mindmap",
	fileName: "mindmap.md",
	file: {
		file_id: "file-mock-001",
		relative_file_path: "summary/mindmap.md",
	} as RecordingDetailFileRef["file"],
}

describe("RecordingSummaryContent mindmap desktop layout", () => {
	it("uses full-height desktop canvas without toolbar bottom gap", () => {
		magicMarkmapPropsMock.mockClear()

		const { container } = render(
			<RecordingSummaryContent
				file={mindmapFile}
				content="# Root\n\n## Branch"
				attachmentList={[]}
				emptyText="Empty"
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		expect(screen.getByTestId("recording-detail-mindmap")).toHaveClass("h-full", "min-h-0")
		expect(container.querySelector(".absolute.inset-0")).toBeTruthy()
		expect(magicMarkmapPropsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				showToolBar: false,
				className: expect.stringContaining("!h-full"),
			}),
		)
	})

	it("renders the desktop view switch at bottom-left", () => {
		const { container } = render(
			<RecordingSummaryContent
				file={mindmapFile}
				content="# Root"
				attachmentList={[]}
				emptyText="Empty"
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		const switchRoot = container.querySelector(".absolute.bottom-4.left-4")
		expect(switchRoot).toBeTruthy()
		expect(container.querySelector(".absolute.bottom-4.right-4")).toBeNull()
	})

	it("switches to markdown mode without player bottom padding on desktop", () => {
		render(
			<RecordingSummaryContent
				file={mindmapFile}
				content="# Root"
				attachmentList={[]}
				emptyText="Empty"
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		fireEvent.click(screen.getByLabelText("detail.showMarkdown"))
		expect(screen.getByTestId("recording-markdown-mock")).toBeTruthy()
	})

	it("keeps desktop view switch outside markdown scroll container", () => {
		const { container } = render(
			<RecordingSummaryContent
				file={mindmapFile}
				content="# Root"
				attachmentList={[]}
				emptyText="Empty"
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		fireEvent.click(screen.getByLabelText("detail.showMarkdown"))

		const root = screen.getByTestId("recording-detail-mindmap")
		const scrollArea = root.querySelector(".overflow-y-auto")
		const switchRoot = container.querySelector(".absolute.bottom-4.left-4")

		expect(scrollArea).toBeTruthy()
		expect(switchRoot).toBeTruthy()
		expect(scrollArea?.contains(switchRoot ?? null)).toBe(false)
	})
})
