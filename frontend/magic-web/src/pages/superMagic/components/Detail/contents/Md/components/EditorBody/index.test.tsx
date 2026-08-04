import { render } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import EditorBody from "."
import { formatLongCurlDataRawForPreview } from "./components/CodeSourceEditor/preview-content"

const codeSourceEditorProps = vi.hoisted(() => vi.fn())

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
	SimpleEditor: () => <div data-testid="simple-editor" />,
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
})
