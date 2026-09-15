import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import {
	findFilePathAttachment,
	openFileByPath,
} from "@/pages/superMagic/components/MessageList/utils/attachmentByFilePath"
import { AttachmentSection } from "../AttachmentSection"

const state = vi.hoisted(() => ({
	content: "",
	files: [] as AttachmentItem[],
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: { getMessageNode: () => ({ content: state.content }) },
}))
vi.mock("@/stores/projectFiles", () => ({ default: {} }))
vi.mock("@/pages/superMagic/components/MessageList/context", () => ({
	useMessageListContext: () => ({ projectFilesStore: { workspaceFilesList: state.files } }),
}))
vi.mock("@/pages/superMagic/components/MessageList/view-state/MessageViewStateContext", () => ({
	useMessageViewState: () => [false, vi.fn()],
}))
vi.mock("@/pages/superMagic/components/MessageList/components/MessageAttachment", () => ({
	Attachment: () => <div data-testid="fallback-attachments" />,
}))
vi.mock("@/pages/superMagic/components/MessageList/utils/openMessageFile", () => ({
	openMessageFile: vi.fn(),
}))
vi.mock(
	"@/pages/superMagic/components/MessageList/components/MessageAttachment/hooks/useFilePathAttachmentDownload",
	() => ({
		useFilePathAttachmentDownload: () => vi.fn(),
	}),
)
vi.mock("@/components/base/MagicFileIcon", () => ({ default: () => null }))
vi.mock("@/components/base/MagicIcon", () => ({ default: () => null }))
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { count?: number }) => `${key}:${options?.count ?? ""}`,
	}),
}))
vi.mock(
	"@/pages/superMagic/components/MessageList/utils/attachmentByFilePath",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@/pages/superMagic/components/MessageList/utils/attachmentByFilePath")
			>()
		return {
			...actual,
			findFilePathAttachment: vi.fn(actual.findFilePathAttachment),
			openFileByPath: vi.fn(),
		}
	},
)

function showAttachments(content: string, paths: string[]) {
	state.content = content
	state.files = paths.map((path, index) => ({
		file_id: String(index),
		relative_file_path: path,
	})) as AttachmentItem[]
	return render(<AttachmentSection prevSuperMessageId="previous-message" />)
}

describe("AttachmentSection file reference deduplication", () => {
	beforeEach(() => vi.clearAllMocks())

	it("looks up each repeated reference once and counts unique files in first-appearance order", () => {
		showAttachments(
			"[B](./docs/b.md) [A](./docs/a.md) [B again](./docs/b.md) [A again](./docs/a.md) [B third](./docs/b.md)",
			["docs/a.md", "docs/b.md"],
		)
		const rows = screen.getAllByTestId("open-file-by-path")
		expect(rows.map((row) => row.textContent)).toEqual(["b.md", "a.md"])
		expect(screen.getByTestId("toggle-expanded")).toHaveTextContent("ui.attachments:2")
		expect(screen.queryByTestId("toggle-expanded-2")).not.toBeInTheDocument()
		expect(findFilePathAttachment).toHaveBeenCalledTimes(2)
	})

	it("merges Markdown and encoded legacy references after resolving the real file path", () => {
		showAttachments(
			"[Report](./docs/my%20report.md) [@file_path:docs/my%20report.md] [@file_path:./docs/my report.md]",
			["docs/my report.md"],
		)
		const rows = screen.getAllByTestId("open-file-by-path")
		expect(rows).toHaveLength(1)
		fireEvent.click(rows[0])
		expect(openFileByPath).toHaveBeenCalledWith(
			expect.objectContaining({ filePath: "docs/my report.md" }),
		)
	})

	it("keeps same-named files in different directories", () => {
		showAttachments("[A](./one/report.md) [B](./two/report.md)", [
			"one/report.md",
			"two/report.md",
		])
		expect(screen.getAllByTestId("open-file-by-path")).toHaveLength(2)
	})

	it("does not discard a legacy reference that can resolve when the same Markdown path cannot", () => {
		showAttachments("[Literal](./docs/a%2520b.md) [@file_path:docs/a%20b.md]", ["docs/a b.md"])
		expect(screen.getAllByTestId("open-file-by-path")).toHaveLength(1)
		expect(findFilePathAttachment).toHaveBeenCalledTimes(2)
	})

	it("keeps literal percent-encoded filenames distinct from decoded filenames", () => {
		showAttachments("[Literal](./docs/a%2520b.md) [Decoded](./docs/a%20b.md)", [
			"docs/a%20b.md",
			"docs/a b.md",
		])
		expect(screen.getAllByTestId("open-file-by-path")).toHaveLength(2)
	})
})
