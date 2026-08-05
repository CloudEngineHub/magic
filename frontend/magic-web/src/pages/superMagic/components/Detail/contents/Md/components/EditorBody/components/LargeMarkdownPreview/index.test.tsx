import {
	Fragment,
	forwardRef,
	type ComponentType,
	type CSSProperties,
	type HTMLAttributes,
	type ReactNode,
} from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import LargeMarkdownPreview from "."

vi.mock("@/models/config/hooks", () => ({
	useTheme: () => ({ prefersColorScheme: "light" }),
}))

vi.mock("react-virtuoso", () => ({
	Virtuoso: forwardRef(
		(
			props: {
				components: {
					List: ComponentType<HTMLAttributes<HTMLDivElement>>
				}
				data: unknown[]
				itemContent: (index: number, item: unknown) => ReactNode
			},
			ref,
		) => {
			void ref
			const List = props.components.List
			const virtuosoStyle: CSSProperties = { height: 320 }

			return (
				<List data-testid="virtual-markdown-list" style={virtuosoStyle}>
					{props.data.map((item, index) => (
						<Fragment key={index}>{props.itemContent(index, item)}</Fragment>
					))}
				</List>
			)
		},
	),
}))

describe("LargeMarkdownPreview", () => {
	it("does not render ReactMarkdown separator text nodes as extra vertical space", () => {
		render(<LargeMarkdownPreview content={"Paragraph one\n\n## Heading\n\nParagraph two"} />)

		expect(screen.getByTestId("virtual-markdown-list")).toHaveStyle({
			height: "320px",
			whiteSpace: "normal",
		})
	})
})
