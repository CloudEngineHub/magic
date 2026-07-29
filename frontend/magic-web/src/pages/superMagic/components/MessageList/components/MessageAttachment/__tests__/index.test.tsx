import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Attachment } from "../index"

const getTemporaryDownloadUrlMock = vi.fn()
const downloadFileWithAnchorMock = vi.fn()

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: (...args: unknown[]) => getTemporaryDownloadUrlMock(...args),
}))

vi.mock("@/pages/superMagic/utils/handleFIle", () => ({
	downloadFileWithAnchor: (...args: unknown[]) => downloadFileWithAnchorMock(...args),
	getFileType: vi.fn(),
}))

vi.mock("@/components/base/MagicFileIcon", () => ({
	default: () => <div />,
}))

vi.mock("@/components/base/MagicIcon", () => ({
	default: ({ onClick }: { onClick: () => void }) => <button onClick={onClick} type="button" />,
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("../../utils/openMessageFile", () => ({
	openMessageFile: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

describe("MessageAttachment", () => {
	beforeEach(() => {
		getTemporaryDownloadUrlMock.mockReset()
		downloadFileWithAnchorMock.mockReset()
	})

	it("requests download mode when the download button is clicked", async () => {
		getTemporaryDownloadUrlMock.mockResolvedValue([{ url: "https://example.invalid/file.pdf" }])

		render(
			<Attachment
				attachments={[
					{
						file_id: "file-1",
						file_extension: "pdf",
						file_name: "file.pdf",
						filename: "file.pdf",
						contentLength: 0,
						url: "",
					},
				]}
				onSelectDetail={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getAllByRole("button")[1])

		expect(getTemporaryDownloadUrlMock).toHaveBeenCalledWith({
			file_ids: ["file-1"],
			is_download: true,
			download_mode: "download",
		})
		await waitFor(() => {
			expect(downloadFileWithAnchorMock).toHaveBeenCalledWith(
				"https://example.invalid/file.pdf",
			)
		})
	})
})
