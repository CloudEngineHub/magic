import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { createTestResourceReferenceResolver } from "../../../../public/__tests__/testResourceReferenceResolver"
import { PromptPlaceholderPreviewText } from "../PromptPlaceholderPreviewText"

const tokenConfig = {
	imageLabel: "图片",
	videoLabel: "视频",
	audioLabel: "音频",
	leftWrapper: "[",
	rightWrapper: "]",
}

describe("PromptPlaceholderPreviewText", () => {
	it("marks only the deleted same-name resource and disables its preview", () => {
		const onPreviewMediaResource = vi.fn()
		const resolveResourceReference = createTestResourceReferenceResolver({
			currentCanvasWorkspacePath: "/画布A",
			attachmentsReady: true,
			attachmentPathsByFileId: {
				current: "/画布A/images/截屏.png",
			},
		})

		render(
			<PromptPlaceholderPreviewText
				text="[图片1][图片2]111"
				tokenConfig={tokenConfig}
				placeholderPaths={{
					image: ["/images/images/截屏.png", "./images/截屏.png"],
				}}
				onPreviewMediaResource={onPreviewMediaResource}
				resolveResourceReference={resolveResourceReference}
				deletedSuffix="（已删除）"
			/>,
		)

		expect(screen.getByTestId("deleted-resource-placeholder")).toHaveTextContent(
			"@截屏.png（已删除）",
		)
		const availableMention = screen.getByRole("button", { name: "@截屏.png" })
		fireEvent.click(availableMention)
		expect(onPreviewMediaResource).toHaveBeenCalledWith(
			expect.objectContaining({ path: "./images/截屏.png" }),
		)
	})

	it("does not mark pending attachments as deleted", () => {
		render(
			<PromptPlaceholderPreviewText
				text="[图片1]"
				tokenConfig={tokenConfig}
				placeholderPaths={{ image: ["./images/pending.png"] }}
				onPreviewMediaResource={vi.fn()}
				resolveResourceReference={createTestResourceReferenceResolver({
					attachmentsReady: false,
				})}
				deletedSuffix="（已删除）"
			/>,
		)

		expect(screen.queryByTestId("deleted-resource-placeholder")).not.toBeInTheDocument()
		expect(screen.getByRole("button", { name: "@pending.png" })).toBeInTheDocument()
	})
})
