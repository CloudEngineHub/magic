import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { RecordingSummaryContent } from "../RecordingSummaryContent"
import {
	RECORDING_DESKTOP_CONTENT_INSET_CLASS,
	RECORDING_DESKTOP_MD_CONTENT_CLASS,
} from "../recording-detail-layout"
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

const summaryFile: RecordingDetailFileRef = {
	type: "summary",
	fileName: "summary.md",
	file: {
		file_id: "file-mock-002",
		relative_file_path: "summary/summary.md",
	} as RecordingDetailFileRef["file"],
}

const highlightsFile: RecordingDetailFileRef = {
	type: "highlights",
	fileName: "highlights.md",
	file: {
		file_id: "file-mock-003",
		relative_file_path: "summary/highlights.md",
	} as RecordingDetailFileRef["file"],
}

const topicsFile: RecordingDetailFileRef = {
	type: "topics",
	fileName: "topics.md",
	file: {
		file_id: "file-mock-004",
		relative_file_path: "summary/topics.md",
	} as RecordingDetailFileRef["file"],
}

const topicsMarkdown = `
## Topics

### 📌 demo_topic | Demo Topic | #000000

#### Key Points
[Speaker-1]
Important discussion.

#### Related Dialogue
- \`00:10-00:20\` Speaker-1: Discussed the plan
`

/** Builds topics markdown with many pills to exercise horizontal overflow in tests. */
function buildManyTopicsMarkdown(count: number): string {
	const topicBlocks = Array.from({ length: count }, (_, index) => {
		const topicIndex = index + 1
		return `### 📌 topic_${topicIndex} | Topic Label ${topicIndex} | #000000

#### Key Points
Summary body ${topicIndex}.`
	})

	return `## Topics\n\n${topicBlocks.join("\n\n---\n\n")}`
}

const manyTopicsMarkdown = buildManyTopicsMarkdown(8)

describe("RecordingSummaryContent desktop markdown layout", () => {
	it("wraps default markdown summary in shared desktop content inset", () => {
		render(
			<RecordingSummaryContent
				file={highlightsFile}
				content="# Highlights\n\nBody text"
				attachmentList={[]}
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		const markdownMock = screen.getByTestId("recording-markdown-mock")
		expect(markdownMock.parentElement).toHaveClass(
			...RECORDING_DESKTOP_MD_CONTENT_CLASS.split(" "),
		)
	})

	it("wraps only topics summary markdown inside shared inset, not outside section chrome", () => {
		render(
			<RecordingSummaryContent
				file={topicsFile}
				content={topicsMarkdown}
				attachmentList={[]}
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		const topicsRoot = screen.getByTestId("recording-detail-topics-content")
		expect(topicsRoot).toHaveClass(...RECORDING_DESKTOP_CONTENT_INSET_CLASS.split(" "))

		const markdownMocks = screen.getAllByTestId("recording-markdown-mock")
		expect(markdownMocks).toHaveLength(1)
		expect(topicsRoot).toContainElement(markdownMocks[0] as HTMLElement)
		expect(screen.getByText("Key Points")).toBeTruthy()
		expect(screen.getByRole("button", { name: "Demo Topic" })).toBeTruthy()
	})
})

describe("RecordingSummaryContent topics pill scroll", () => {
	let scrollIntoViewMock: ReturnType<typeof vi.fn>
	let originalScrollIntoView: PropertyDescriptor | undefined

	beforeEach(() => {
		scrollIntoViewMock = vi.fn()
		originalScrollIntoView = Object.getOwnPropertyDescriptor(
			HTMLElement.prototype,
			"scrollIntoView",
		)
		Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
			configurable: true,
			value: scrollIntoViewMock,
		})
	})

	afterEach(() => {
		if (originalScrollIntoView) {
			Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView)
		}
	})

	it("uses a hidden-scrollbar horizontal scroll container for topic pills", () => {
		render(
			<RecordingSummaryContent
				file={topicsFile}
				content={topicsMarkdown}
				attachmentList={[]}
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		const scrollContainer = screen.getByTestId("recording-detail-topics-scroll")
		expect(scrollContainer).toHaveClass("overflow-x-auto", "no-scrollbar")
		expect(scrollContainer.firstElementChild).toHaveClass("w-max", "flex-nowrap")
	})

	it("shows start and end fades when topic pills overflow and are partially scrolled", () => {
		const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(
			HTMLElement.prototype,
			"scrollWidth",
		)
		const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
			HTMLElement.prototype,
			"clientWidth",
		)
		const scrollLeftDescriptor = Object.getOwnPropertyDescriptor(
			HTMLElement.prototype,
			"scrollLeft",
		)

		Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
			configurable: true,
			get() {
				return 640
			},
		})
		Object.defineProperty(HTMLElement.prototype, "clientWidth", {
			configurable: true,
			get() {
				return 240
			},
		})
		Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
			configurable: true,
			get() {
				return 120
			},
		})

		render(
			<RecordingSummaryContent
				file={topicsFile}
				content={manyTopicsMarkdown}
				attachmentList={[]}
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		expect(screen.getByTestId("recording-detail-topics-fade-start")).toBeInTheDocument()
		expect(screen.getByTestId("recording-detail-topics-fade-end")).toBeInTheDocument()

		if (scrollWidthDescriptor) {
			Object.defineProperty(HTMLElement.prototype, "scrollWidth", scrollWidthDescriptor)
		}
		if (clientWidthDescriptor) {
			Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDescriptor)
		}
		if (scrollLeftDescriptor) {
			Object.defineProperty(HTMLElement.prototype, "scrollLeft", scrollLeftDescriptor)
		}
	})

	it("maps vertical wheel input to horizontal scroll on the topic pill strip", () => {
		render(
			<RecordingSummaryContent
				file={topicsFile}
				content={manyTopicsMarkdown}
				attachmentList={[]}
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		const scrollContainer = screen.getByTestId("recording-detail-topics-scroll")
		Object.defineProperty(scrollContainer, "scrollWidth", {
			configurable: true,
			value: 640,
		})
		Object.defineProperty(scrollContainer, "clientWidth", {
			configurable: true,
			value: 240,
		})
		Object.defineProperty(scrollContainer, "scrollLeft", {
			configurable: true,
			writable: true,
			value: 0,
		})

		fireEvent.wheel(scrollContainer, { deltaY: 40, deltaX: 0 })
		expect(scrollContainer.scrollLeft).toBe(40)
	})

	it("scrolls the active topic pill into view when selection changes", () => {
		render(
			<RecordingSummaryContent
				file={topicsFile}
				content={manyTopicsMarkdown}
				attachmentList={[]}
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "Topic Label 5" }))

		expect(scrollIntoViewMock).toHaveBeenCalledWith({
			block: "nearest",
			inline: "center",
		})
	})
})

describe("RecordingSummaryContent empty state", () => {
	it("renders unified empty state with icon and emptySummary copy inside centered region", () => {
		const { container } = render(
			<RecordingSummaryContent
				file={summaryFile}
				content=""
				attachmentList={[]}
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		const emptyState = screen.getByTestId("recording-detail-empty-noSummaryFile")
		expect(emptyState).toBeInTheDocument()
		expect(screen.getByText("detail.emptySummary")).toBeInTheDocument()
		expect(
			emptyState.closest('[data-testid="recording-detail-region-empty-slot"]'),
		).toHaveClass("min-h-full", "items-center", "justify-center")
		expect(container.querySelector(".lucide-sparkles")).toBeTruthy()
	})
})

describe("RecordingSummaryContent mindmap desktop layout", () => {
	it("uses full-height desktop canvas without toolbar bottom gap", () => {
		magicMarkmapPropsMock.mockClear()

		const { container } = render(
			<RecordingSummaryContent
				file={mindmapFile}
				content="# Root\n\n## Branch"
				attachmentList={[]}
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
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		fireEvent.click(screen.getByLabelText("detail.showMarkdown"))
		expect(screen.getByTestId("recording-markdown-mock")).toBeTruthy()
	})

	it("reserves safe inset in desktop markdown mode so the view switch does not cover text", () => {
		const { container } = render(
			<RecordingSummaryContent
				file={mindmapFile}
				content="# Root"
				attachmentList={[]}
				speakerNameMap={{}}
				onOpenSpeakerSettings={() => undefined}
				onTimeClick={() => undefined}
				layout="desktop"
			/>,
		)

		fireEvent.click(screen.getByLabelText("detail.showMarkdown"))

		const scrollArea = container.querySelector(".overflow-y-auto")
		expect(scrollArea).toHaveClass("pb-20", "pl-28")
	})

	it("keeps desktop view switch outside markdown scroll container", () => {
		const { container } = render(
			<RecordingSummaryContent
				file={mindmapFile}
				content="# Root"
				attachmentList={[]}
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
