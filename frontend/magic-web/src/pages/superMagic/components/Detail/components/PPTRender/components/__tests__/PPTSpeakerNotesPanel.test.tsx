import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import PPTSpeakerNotesPanel from "../PPTSpeakerNotesPanel"
import { unshadow } from "@/utils/shadow"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/tiptap-templates/simple/simple-editor", async () => {
	const { forwardRef } = await import("react")
	return {
		SimpleEditor: forwardRef(
			(
				{
					content,
					isEditable,
					onContentChange,
				}: {
					content: string
					isEditable: boolean
					onContentChange: (value: string) => void
				},
				ref,
			) => (
				<>
					{isEditable ? (
						<textarea
							ref={ref as React.Ref<HTMLTextAreaElement>}
							data-testid="ppt-speaker-notes-editor"
							value={content}
							onChange={(event) => onContentChange(event.target.value)}
						/>
					) : (
						<div>{content}</div>
					)}
				</>
			),
		),
	}
})

describe("PPTSpeakerNotesPanel", () => {
	it("does not apply an AI action to another slide after a pending save", async () => {
		let finishSave!: (value: boolean) => void
		const onGenerate = vi.fn()
		const props = {
			slideIndex: 0,
			fileId: "first",
			rawContent: "",
			allowEdit: true,
			onGenerate,
			onSaved: vi.fn().mockResolvedValue(undefined),
			saveEditContent: vi.fn(
				() =>
					new Promise<boolean>((resolve) => {
						finishSave = resolve
					}),
			),
		}
		const { rerender } = render(<PPTSpeakerNotesPanel {...props} />)
		fireEvent.change(await screen.findByTestId("ppt-speaker-notes-editor"), {
			target: { value: "First page draft" },
		})
		fireEvent.click(screen.getByText("ppt.speakerNotes.polish"))
		rerender(<PPTSpeakerNotesPanel {...props} fileId="second" slideIndex={1} />)
		finishSave(true)
		await waitFor(() => expect(props.onSaved).toHaveBeenCalled())
		expect(onGenerate).not.toHaveBeenCalled()
	})

	it("disables polish and shorten for empty notes", () => {
		render(
			<PPTSpeakerNotesPanel
				slideIndex={0}
				fileId="empty"
				rawContent=""
				allowEdit
				onGenerate={vi.fn()}
				onSaved={vi.fn()}
			/>,
		)
		expect(screen.getByText("ppt.speakerNotes.generate")).toBeEnabled()
		expect(screen.getByText("ppt.speakerNotes.polish")).toBeDisabled()
		expect(screen.getByText("ppt.speakerNotes.shorten")).toBeDisabled()
	})

	it.each(["generate", "polish", "shorten"] as const)(
		"saves the current draft before %s",
		async (action) => {
			const onGenerate = vi.fn()
			const onSaved = vi.fn().mockResolvedValue(undefined)
			render(
				<PPTSpeakerNotesPanel
					slideIndex={0}
					fileId="draft"
					rawContent=""
					allowEdit
					onGenerate={onGenerate}
					onSaved={onSaved}
					saveEditContent={vi.fn().mockResolvedValue(true)}
				/>,
			)
			const editor = await screen.findByTestId("ppt-speaker-notes-editor")
			fireEvent.change(editor, { target: { value: "**Current draft**" } })
			const button = screen.getByText(`ppt.speakerNotes.${action}`)
			fireEvent.blur(editor, { relatedTarget: button })
			expect(onSaved).not.toHaveBeenCalled()
			fireEvent.click(button)
			await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(action))
			expect(onSaved.mock.invocationCallOrder[0]).toBeLessThan(
				onGenerate.mock.invocationCallOrder[0],
			)
		},
	)

	it("does not request AI changes when saving the draft fails", async () => {
		const onGenerate = vi.fn()
		render(
			<PPTSpeakerNotesPanel
				slideIndex={0}
				fileId="draft"
				rawContent=""
				allowEdit
				onGenerate={onGenerate}
				onSaved={vi.fn()}
				saveEditContent={vi.fn().mockResolvedValue(false)}
			/>,
		)
		fireEvent.change(await screen.findByTestId("ppt-speaker-notes-editor"), {
			target: { value: "Do not lose this" },
		})
		fireEvent.click(screen.getByText("ppt.speakerNotes.polish"))
		await screen.findByText("ppt.speakerNotes.saveFailed")
		expect(onGenerate).not.toHaveBeenCalled()
		expect(screen.getByTestId("ppt-speaker-notes-editor")).toHaveValue("Do not lose this")
	})

	it("keeps unsaved drafts on their own slide when navigating while collapsed", async () => {
		const props = {
			slideIndex: 0,
			rawContent: "",
			fileId: "slide-1",
			allowEdit: true,
			onSaved: vi.fn(),
		}
		const { rerender } = render(<PPTSpeakerNotesPanel {...props} />)
		await screen.findByTestId("ppt-speaker-notes-editor")
		fireEvent.change(screen.getByTestId("ppt-speaker-notes-editor"), {
			target: { value: "Page one draft" },
		})
		rerender(<PPTSpeakerNotesPanel {...props} visible={false} />)
		rerender(
			<PPTSpeakerNotesPanel {...props} fileId="slide-2" slideIndex={1} visible={false} />,
		)
		rerender(<PPTSpeakerNotesPanel {...props} fileId="slide-2" slideIndex={1} />)
		expect(screen.getByTestId("ppt-speaker-notes-content")).not.toHaveTextContent(
			"Page one draft",
		)
		rerender(<PPTSpeakerNotesPanel {...props} />)
		expect(await screen.findByTestId("ppt-speaker-notes-editor")).toHaveValue("Page one draft")
	})

	it("retains a failed draft while collapsed and retries after reopening", async () => {
		const saveEditContent = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
		const props = {
			slideIndex: 0,
			rawContent: "<main>Slide</main>",
			fileId: "slide-1",
			allowEdit: true,
			saveEditContent,
			onSaved: vi.fn().mockResolvedValue(undefined),
		}
		const { rerender } = render(<PPTSpeakerNotesPanel {...props} />)
		await screen.findByTestId("ppt-speaker-notes-editor")
		fireEvent.change(screen.getByTestId("ppt-speaker-notes-editor"), {
			target: { value: "Keep this draft" },
		})
		fireEvent.blur(screen.getByTestId("ppt-speaker-notes-editor"))
		await screen.findByText("ppt.speakerNotes.saveFailed")
		rerender(<PPTSpeakerNotesPanel {...props} visible={false} />)
		expect(screen.getByTestId("ppt-speaker-notes-panel")).not.toBeVisible()
		rerender(<PPTSpeakerNotesPanel {...props} visible />)
		expect(screen.getByTestId("ppt-speaker-notes-editor")).toHaveValue("Keep this draft")
		fireEvent.click(screen.getByText("ppt.speakerNotes.save"))
		await waitFor(() => expect(props.onSaved).toHaveBeenCalled())
	})

	it("allows keyboard resizing without editing the notes", () => {
		render(
			<PPTSpeakerNotesPanel
				slideIndex={0}
				rawContent=""
				fileId="slide-1"
				allowEdit
				onSaved={vi.fn()}
			/>,
		)
		fireEvent.keyDown(screen.getByRole("button", { name: "ppt.speakerNotes.resize" }), {
			key: "ArrowUp",
		})
		expect(screen.getByTestId("ppt-speaker-notes-panel")).toHaveStyle({ height: "164px" })
	})

	it("edits directly and saves on blur while the slide remains outside PPT edit mode", async () => {
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

		await screen.findByTestId("ppt-speaker-notes-editor")
		const editor = screen.getByTestId("ppt-speaker-notes-editor")
		fireEvent.change(editor, { target: { value: "Introduce the key point." } })
		fireEvent.blur(editor)

		await waitFor(() => expect(saveEditContent).toHaveBeenCalledTimes(1))
		const savedContent = unshadow(saveEditContent.mock.calls[0][0])
		expect(savedContent).toContain("data-magic-slide-notes")
		expect(saveEditContent.mock.calls[0].slice(1)).toEqual(["slide-1", true, undefined, true])
		expect(onSaved).toHaveBeenCalledWith(expect.stringContaining("Introduce the key point."), 0)
		expect(screen.getByTestId("ppt-speaker-notes-editor")).toHaveValue(
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

		await screen.findByTestId("ppt-speaker-notes-editor")
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

		await screen.findByTestId("ppt-speaker-notes-editor")
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

		await screen.findByTestId("ppt-speaker-notes-editor")
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

		await screen.findByTestId("ppt-speaker-notes-editor")
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
