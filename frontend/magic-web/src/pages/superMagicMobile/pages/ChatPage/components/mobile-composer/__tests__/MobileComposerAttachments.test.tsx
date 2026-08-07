import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FileData } from "@/pages/superMagic/components/MessageEditor/types"
import MobileComposerAttachments from "../MobileComposerAttachments"

const objectUrlMock = vi.hoisted(() => ({ value: null as string | null }))

vi.mock("@/pages/superMagic/components/MessageEditor/components/AtItem/hooks/useObjectURL", () => ({
	default: () => objectUrlMock.value,
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
		}),
	}
})

function createFile(overrides: Partial<FileData> = {}): FileData {
	return {
		id: "file-1",
		name: "demo.mp3",
		file: new File(["audio"], "demo.mp3", { type: "audio/mpeg" }),
		status: "uploading",
		progress: 42.4,
		...overrides,
	}
}

describe("MobileComposerAttachments", () => {
	beforeEach(() => {
		objectUrlMock.value = null
	})

	it("uses the same normalized display progress as the editor mention", () => {
		render(<MobileComposerAttachments files={[createFile()]} onRemove={vi.fn()} />)

		expect(screen.getByText("42%")).toBeInTheDocument()
	})

	it("treats init as uploading", () => {
		render(
			<MobileComposerAttachments
				files={[createFile({ status: "init", progress: 0 })]}
				onRemove={vi.fn()}
			/>,
		)

		expect(screen.getByText("0%")).toBeInTheDocument()
		expect(
			screen.getByTestId("mobile-composer-attachment-item").querySelector(".animate-spin"),
		).toBeInTheDocument()
	})

	it("shows only loading feedback while an image preview is uploading", () => {
		const imageFile = createFile({
			name: "photo.png",
			file: new File(["image"], "photo.png", { type: "image/png" }),
			status: "uploading",
			progress: 68,
		})

		render(<MobileComposerAttachments files={[imageFile]} onRemove={vi.fn()} />)

		expect(screen.queryByText("68%")).not.toBeInTheDocument()
		expect(
			screen.getByTestId("mobile-composer-attachment-item").querySelector(".animate-spin"),
		).toBeInTheDocument()
	})
})
