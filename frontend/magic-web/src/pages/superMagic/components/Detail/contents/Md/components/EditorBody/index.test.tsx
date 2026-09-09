import { render, screen, waitFor } from "@testing-library/react"
import { forwardRef, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import EditorBody from "."
import { formatLongCurlDataRawForPreview } from "./components/CodeSourceEditor/preview-content"

const codeSourceEditorProps = vi.hoisted(() => vi.fn())
const simpleEditorProps = vi.hoisted(() => vi.fn())
const markdownPreviewProps = vi.hoisted(() => vi.fn())

vi.mock("./components/CodeSourceEditor", () => ({
	default: (props: Record<string, unknown>) => {
		codeSourceEditorProps(props)
		return <div data-testid="code-source-editor" />
	},
}))

vi.mock("./components/EditorErrorBoundary", () => ({
	default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/tiptap-templates/simple/simple-editor", () => ({
	SimpleEditor: forwardRef((props: Record<string, unknown>, _ref) => {
		void _ref
		simpleEditorProps(props)
		return <div data-testid="simple-editor" />
	}),
}))

vi.mock("./components/LargeMarkdownPreview", () => ({
	default: () => <div data-testid="large-markdown-preview" />,
}))

vi.mock("./components/MarkdownPreview", () => ({
	default: (props: Record<string, unknown>) => {
		markdownPreviewProps(props)
		return <div data-testid="markdown-preview" />
	},
}))

vi.mock("@/components/tiptap-templates/simple/hooks", () => ({
	useProjectImageExtensions: () => [],
}))

vi.mock("./hooks/useCustomLinkNode", () => ({
	useCustomLinkNode: () => undefined,
}))

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("ahooks", () => ({
	useMemoizedFn: <T,>(fn: T) => fn,
}))

describe("EditorBody code source content", () => {
	beforeEach(() => {
		codeSourceEditorProps.mockClear()
		simpleEditorProps.mockClear()
		markdownPreviewProps.mockClear()
	})

	it("formats only read-only source previews", () => {
		const payload = JSON.stringify({ events: Array.from({ length: 200 }, (_, id) => ({ id })) })
		const source = `curl https://example.com --data-raw '${payload}'`
		const { rerender } = render(
			<EditorBody isLoading={false} viewMode="code" language="markdown" content={source} />,
		)

		expect(codeSourceEditorProps).toHaveBeenLastCalledWith(
			expect.objectContaining({
				content: formatLongCurlDataRawForPreview(source),
			}),
		)

		rerender(
			<EditorBody
				isLoading={false}
				viewMode="code"
				language="markdown"
				content={source}
				isEditMode
				editContent={source}
			/>,
		)

		expect(codeSourceEditorProps).toHaveBeenLastCalledWith(
			expect.objectContaining({ content: source, isEditMode: true }),
		)
	})

	it("keeps small markdown documents out of SimpleEditor in read-only mode", async () => {
		render(<EditorBody isLoading={false} viewMode="desktop" content="# Small document" />)

		expect(screen.getByTestId("markdown-preview")).toBeInTheDocument()
		expect(screen.queryByTestId("simple-editor")).not.toBeInTheDocument()
		expect(screen.queryByTestId("large-markdown-preview")).not.toBeInTheDocument()
	})

	it("passes markdown content and link context to the small markdown preview", () => {
		render(
			<EditorBody
				isLoading={false}
				viewMode="desktop"
				content="# Small document"
				processedContent="# Processed document"
			/>,
		)

		expect(markdownPreviewProps).toHaveBeenLastCalledWith(
			expect.objectContaining({
				content: "# Processed document",
				onLinkClick: expect.any(Function),
			}),
		)
	})

	it("loads SimpleEditor only when a small markdown document is editable", async () => {
		render(
			<EditorBody
				isLoading={false}
				viewMode="desktop"
				content="# Small document"
				isEditMode
				editContent="# Small document"
			/>,
		)

		await waitFor(() => expect(screen.getByTestId("simple-editor")).toBeInTheDocument())
		expect(screen.queryByTestId("markdown-preview")).not.toBeInTheDocument()
	})

	it("uses the virtual preview for read-only markdown larger than 3 MB", () => {
		render(
			<EditorBody
				isLoading={false}
				viewMode="desktop"
				content={"a".repeat(3 * 1024 * 1024 + 1)}
			/>,
		)

		expect(screen.getByTestId("large-markdown-preview")).toBeInTheDocument()
		expect(screen.queryByTestId("simple-editor")).not.toBeInTheDocument()
	})

	it("forces large markdown editing through the source editor", () => {
		const content = "a".repeat(3 * 1024 * 1024 + 1)
		render(
			<EditorBody
				isLoading={false}
				viewMode="desktop"
				content={content}
				editContent={content}
				isEditMode
			/>,
		)

		expect(screen.getByTestId("code-source-editor")).toBeInTheDocument()
		expect(codeSourceEditorProps).toHaveBeenLastCalledWith(
			expect.objectContaining({ content, isEditMode: true, language: "text" }),
		)
	})
})
