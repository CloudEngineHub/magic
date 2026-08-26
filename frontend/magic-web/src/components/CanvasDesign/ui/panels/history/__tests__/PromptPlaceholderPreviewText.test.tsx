import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PromptPlaceholderPreviewText } from "../PromptPlaceholderPreviewText"
import styles from "../PromptPlaceholderPreviewText.module.css"

const tokenConfig = {
	imageLabel: "图片",
	videoLabel: "视频",
	audioLabel: "音频",
	leftWrapper: "[",
	rightWrapper: "]",
}

describe("PromptPlaceholderPreviewText", () => {
	it("shows opaque asset paths without enabling preview", () => {
		const onPreviewMediaResource = vi.fn()

		render(
			<PromptPlaceholderPreviewText
				text="[图片1] [视频1] [音频1] [图片2]"
				tokenConfig={tokenConfig}
				placeholderPaths={{
					image: ["asset://image-id"],
					video: ["asset://video-id"],
					audio: ["asset://audio-id"],
				}}
				onPreviewMediaResource={onPreviewMediaResource}
			/>,
		)

		const opaqueImageMention = screen.getByText("@asset://image-id")
		expect(opaqueImageMention).toHaveClass(styles.opaquePlaceholder)
		expect(screen.getByText("@asset://video-id")).toBeInTheDocument()
		expect(screen.getByText("@asset://audio-id")).toBeInTheDocument()
		expect(screen.getByText("[图片2]")).toBeInTheDocument()
		expect(screen.queryByRole("button")).not.toBeInTheDocument()

		fireEvent.click(opaqueImageMention)
		expect(onPreviewMediaResource).not.toHaveBeenCalled()
	})
})
