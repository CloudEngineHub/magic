import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import PPTSpeakerNotesPanel from "../PPTSpeakerNotesPanel"
import { unshadow } from "@/utils/shadow"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("PPTSpeakerNotesPanel", () => {
	it("enters an independent edit state while the slide remains outside PPT edit mode", async () => {
		const saveEditContent = vi.fn().mockResolvedValue(true)
		const onSaved = vi.fn().mockResolvedValue(undefined)

		render(
			<PPTSpeakerNotesPanel
				slideIndex={0}
				rawContent="<main>Slide</main>"
				fileId="slide-1"
				allowEdit
				saveEditContent={saveEditContent}
				onSaved={onSaved}
			/>,
		)

		fireEvent.click(screen.getByTestId("ppt-speaker-notes-panel").querySelector("button")!)
		const editor = screen.getByTestId("ppt-speaker-notes-editor")
		fireEvent.change(editor, { target: { value: "Introduce the key point." } })
		fireEvent.blur(editor)

		await waitFor(() => expect(saveEditContent).toHaveBeenCalledTimes(1))
		const savedContent = unshadow(saveEditContent.mock.calls[0][0])
		expect(savedContent).toContain("data-magic-slide-notes")
		expect(saveEditContent.mock.calls[0].slice(1)).toEqual(["slide-1", true, undefined, true])
		expect(onSaved).toHaveBeenCalledWith(expect.stringContaining("Introduce the key point."), 0)
		expect(screen.getByTestId("ppt-speaker-notes-panel")).toHaveTextContent(
			"Introduce the key point.",
		)
	})

	it("keeps the panel read-only when editing is disabled", () => {
		render(
			<PPTSpeakerNotesPanel
				slideIndex={0}
				rawContent="<template data-magic-slide-notes>Read only</template>"
				fileId="slide-1"
				allowEdit={false}
				onSaved={vi.fn().mockResolvedValue(undefined)}
			/>,
		)

		expect(screen.getByTestId("ppt-speaker-notes-panel")).toHaveTextContent("Read only")
		expect(screen.queryByTestId("ppt-speaker-notes-editor")).not.toBeInTheDocument()
	})
})
