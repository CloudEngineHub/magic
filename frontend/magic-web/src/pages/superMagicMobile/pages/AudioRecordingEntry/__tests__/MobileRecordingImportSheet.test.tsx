import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { MobileRecordingImportSheet } from "../components/MobileRecordingImportSheet"

const uploadActionSpy = vi.fn()

function createFileList(files: File[]): FileList {
	return {
		length: files.length,
		item: (index: number) => files[index] ?? null,
		...files,
	} as FileList
}

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/shadcn-ui/sheet", () => ({
	Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
		open ? <div data-testid="mock-sheet">{children}</div> : null,
	SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("MobileRecordingImportSheet", () => {
	it("wires the file import button to the shared audio upload action", () => {
		const onOpenChange = vi.fn()
		const onImportFiles = vi.fn()

		render(
			<MobileRecordingImportSheet
				open
				onOpenChange={onOpenChange}
				onImportFiles={onImportFiles}
				AudioUploadActionComponent={({
					handler,
					onFileChange,
				}: {
					handler: (onUpload: () => void) => React.ReactNode
					onFileChange?: (files: FileList) => void
				}) => {
					uploadActionSpy(onFileChange)
					return handler(() => {
						onFileChange?.(
							createFileList([
								new File(["voice"], "meeting.wav", { type: "audio/wav" }),
							]),
						)
					})
				}}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-import-from-file"))

		expect(uploadActionSpy).toHaveBeenCalled()
		expect(onImportFiles).toHaveBeenCalled()
		expect(onOpenChange).toHaveBeenCalledWith(false)
	})
})
