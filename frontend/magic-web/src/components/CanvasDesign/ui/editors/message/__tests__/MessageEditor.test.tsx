import { Node } from "@tiptap/core"
import { render, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MessageEditor from "../MessageEditor"

const TestMentionExtension = Node.create({
	name: "mention",
	group: "inline",
	inline: true,
	atom: true,
	addAttributes() {
		return {
			type: { default: null },
			data: { default: null },
		}
	},
	parseHTML() {
		return [{ tag: "span[data-test-mention]" }]
	},
	renderHTML() {
		return ["span", { "data-test-mention": "" }]
	},
})

describe("MessageEditor mention synchronization", () => {
	it("reports mentions that were already parsed during editor initialization", async () => {
		const onMentionChange = vi.fn()

		render(
			<MessageEditor
				value="@linked.png"
				matchableItems={[{ name: "linked.png", path: "./images/linked.png" }]}
				mentionExtension={TestMentionExtension}
				onMentionChange={onMentionChange}
			/>,
		)

		await waitFor(() => {
			expect(onMentionChange).toHaveBeenCalledWith(["./images/linked.png"], "@linked.png", {
				source: "sync",
			})
		})
	})
})
