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

	it("merges notes into the latest slide HTML before saving", async () => {
		const saveEditContent = vi.fn().mockResolvedValue(true)
		const onSaved = vi.fn().mockResolvedValue(undefined)
		let latestRawContent = "<main>AI updated slide</main>"

		render(
			<PPTSpeakerNotesPanel
				slideIndex={0}
				rawContent="<main>Original slide</main>"
				fileId="slide-1"
				getLatestRawContent={() => latestRawContent}
				allowEdit
				saveEditContent={saveEditContent}
				onSaved={onSaved}
			/>,
		)

		fireEvent.click(screen.getByTestId("ppt-speaker-notes-panel").querySelector("button")!)
		fireEvent.change(screen.getByTestId("ppt-speaker-notes-editor"), {
			target: { value: "Keep this AI change." },
		})
		latestRawContent = "<main>AI changed again</main>"
		fireEvent.blur(screen.getByTestId("ppt-speaker-notes-editor"))

		await waitFor(() => expect(saveEditContent).toHaveBeenCalledTimes(1))
		expect(unshadow(saveEditContent.mock.calls[0][0])).toContain(
			"<main>AI changed again</main>",
		)
	})

	it("retries once when the slide changes during the save request", async () => {
		let resolveFirstSave: ((value: boolean) => void) | undefined
		const saveEditContent = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<boolean>((resolve) => {
						resolveFirstSave = resolve
					}),
			)
			.mockResolvedValue(true)
		const onSaved = vi.fn().mockResolvedValue(undefined)
		let latestRawContent = "<main>Original slide</main>"

		render(
			<PPTSpeakerNotesPanel
				slideIndex={0}
				rawContent={latestRawContent}
				fileId="slide-1"
				getLatestRawContent={() => latestRawContent}
				allowEdit
				saveEditContent={saveEditContent}
				onSaved={onSaved}
			/>,
		)

		fireEvent.click(screen.getByTestId("ppt-speaker-notes-panel").querySelector("button")!)
		fireEvent.change(screen.getByTestId("ppt-speaker-notes-editor"), {
			target: { value: "Keep my notes." },
		})
		fireEvent.blur(screen.getByTestId("ppt-speaker-notes-editor"))
		await waitFor(() => expect(saveEditContent).toHaveBeenCalledTimes(1))

		latestRawContent = "<main>AI updated while saving</main>"
		resolveFirstSave?.(true)

		await waitFor(() => expect(saveEditContent).toHaveBeenCalledTimes(2))
		expect(unshadow(saveEditContent.mock.calls[1][0])).toContain(
			"<main>AI updated while saving</main>",
		)
	})

	it("keeps rebasing until concurrent slide updates stop", async () => {
		let latestRawContent = "<main>Version 1</main>"
		const saveEditContent = vi.fn().mockImplementation(async () => {
			if (saveEditContent.mock.calls.length === 1) {
				latestRawContent = "<main>Version 2</main>"
			} else if (saveEditContent.mock.calls.length === 2) {
				latestRawContent = "<main>Version 3</main>"
			}
			return true
		})

		render(
			<PPTSpeakerNotesPanel
				slideIndex={0}
				rawContent={latestRawContent}
				fileId="slide-1"
				getLatestRawContent={() => latestRawContent}
				allowEdit
				saveEditContent={saveEditContent}
				onSaved={vi.fn().mockResolvedValue(undefined)}
			/>,
		)

		fireEvent.click(screen.getByTestId("ppt-speaker-notes-panel").querySelector("button")!)
		fireEvent.change(screen.getByTestId("ppt-speaker-notes-editor"), {
			target: { value: "Stable note" },
		})
		fireEvent.blur(screen.getByTestId("ppt-speaker-notes-editor"))

		await waitFor(() => expect(saveEditContent).toHaveBeenCalledTimes(3))
		expect(unshadow(saveEditContent.mock.calls[2][0])).toContain("<main>Version 3</main>")
	})

	it("stops safely instead of overwriting when the slide never stabilizes", async () => {
		let version = 0
		const saveEditContent = vi.fn().mockImplementation(async () => {
			version += 1
			return true
		})
		const onSaved = vi.fn().mockResolvedValue(undefined)

		render(
			<PPTSpeakerNotesPanel
				slideIndex={0}
				rawContent="<main>Version 0</main>"
				fileId="slide-1"
				getLatestRawContent={() => `<main>Version ${version}</main>`}
				allowEdit
				saveEditContent={saveEditContent}
				onSaved={onSaved}
			/>,
		)

		fireEvent.click(screen.getByTestId("ppt-speaker-notes-panel").querySelector("button")!)
		fireEvent.change(screen.getByTestId("ppt-speaker-notes-editor"), {
			target: { value: "Do not lose this note" },
		})
		fireEvent.blur(screen.getByTestId("ppt-speaker-notes-editor"))

		await waitFor(() => expect(saveEditContent).toHaveBeenCalledTimes(4))
		expect(onSaved).not.toHaveBeenCalled()
		expect(screen.getByTestId("ppt-speaker-notes-panel")).toHaveTextContent(
			"ppt.speakerNotes.saveFailed",
		)
	})
})
