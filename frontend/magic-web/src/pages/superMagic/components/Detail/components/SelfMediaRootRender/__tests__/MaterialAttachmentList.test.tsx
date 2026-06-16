import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MaterialAttachmentList from "../components/SelfMediaInitPanel/components/material/MaterialAttachmentList"
import MaterialUpload from "../components/SelfMediaInitPanel/components/material/MaterialUpload"
import type { MaterialItem } from "../components/SelfMediaInitPanel/types"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (key: string, fallback?: string) => {
			const messages: Record<string, string> = {
				"detail.selfMedia.initPanel.materialAttachment.addCompact": "Add attachment",
				"detail.selfMedia.initPanel.materialAttachment.addFull":
					"Upload, drag, or paste materials",
				"detail.selfMedia.initPanel.materialAttachment.descriptionPlaceholder":
					"Add a short note...",
				"detail.selfMedia.initPanel.materialAttachment.emptyHint":
					"Images, videos, PDFs, and documents are supported",
			}
			return messages[key] || fallback || key
		},
	}),
}))

vi.mock("@/stores/projectFiles", () => ({
	default: {
		workspaceFilesList: [],
	},
}))

vi.mock("../components/SelfMediaInitPanel/lib/useDropZone", () => ({
	useDropZone: () => ({
		isDragging: false,
		dropZoneProps: {},
	}),
}))

vi.mock("../components/SelfMediaInitPanel/components/ui/InlineVoiceButton", () => ({
	default: () => <button type="button" data-testid="inline-voice-button" />,
}))

const material: MaterialItem = {
	id: "material-1",
	file: new File(["hello"], "brief.txt", { type: "text/plain" }),
	previewUrl: "",
	description: "",
}

describe("MaterialAttachmentList", () => {
	it("uses localized default upload and description hints", () => {
		render(<MaterialAttachmentList materials={[material]} onChange={vi.fn()} />)

		expect(screen.getByText("Upload, drag, or paste materials")).toBeInTheDocument()
		expect(screen.getByPlaceholderText("Add a short note...")).toBeInTheDocument()
		expect(screen.queryByText("点击、拖拽或粘贴上传附件")).not.toBeInTheDocument()
		expect(screen.queryByPlaceholderText("添加说明…")).not.toBeInTheDocument()
	})

	it("uses localized compact upload label", () => {
		render(<MaterialAttachmentList compact materials={[]} onChange={vi.fn()} />)

		expect(screen.getByText("Add attachment")).toBeInTheDocument()
		expect(screen.queryByText("添加附件")).not.toBeInTheDocument()
	})
})

describe("MaterialUpload", () => {
	it("passes localized legacy material upload hints", () => {
		render(<MaterialUpload materials={[material]} onChange={vi.fn()} />)

		expect(screen.getByText("Upload, drag, or paste materials")).toBeInTheDocument()
		expect(
			screen.getByText("Images, videos, PDFs, and documents are supported"),
		).toBeInTheDocument()
		expect(screen.getByPlaceholderText("Add a short note...")).toBeInTheDocument()
		expect(screen.queryByText("点击或拖拽上传素材")).not.toBeInTheDocument()
	})
})
