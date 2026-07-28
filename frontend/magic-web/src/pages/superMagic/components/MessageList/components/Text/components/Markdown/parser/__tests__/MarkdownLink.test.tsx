import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MarkdownLink } from "../MarkdownLink"

vi.mock("@/stores/projectFiles", () => ({
	default: {
		workspaceFilesList: [],
	},
}))

vi.mock("@/utils/pubsub", () => ({
	default: {
		publish: vi.fn(),
	},
	PubSubEvents: {},
}))

describe("MarkdownLink", () => {
	it("normalizes inline style attributes before passing them to the anchor", () => {
		const { container } = render(
			<MarkdownLink
				href="https://example.com"
				domNode={{
					attribs: {
						style: "color: red; background-color: blue",
						"data-source": "markdown",
					},
				}}
			>
				测试链接
			</MarkdownLink>,
		)

		const anchor = container.querySelector("a")

		expect(anchor).toBeInTheDocument()
		expect(anchor?.style.color).toBe("red")
		expect(anchor?.style.getPropertyValue("background-color")).toBe("blue")
		expect(anchor).toHaveAttribute("data-source", "markdown")
	})
})
