import type { PropsWithChildren, ReactNode } from "react"
import { act, render, screen } from "@testing-library/react"
import { observable, runInAction } from "mobx"
import { describe, expect, it, vi } from "vitest"
import type { FileUploadStore } from "../../stores/FileUploadStore"
import UploadHoverPanelButton from "../UploadHoverPanelButton"

vi.mock("@/components/base/UploadAction", () => ({
	default: ({ handler }: { handler: (trigger: () => void) => ReactNode }) => handler(vi.fn()),
}))

vi.mock("@/components/base", () => ({
	MagicTooltip: ({ children }: PropsWithChildren) => children,
}))

vi.mock("@/components/base/MagicIcon", () => ({
	default: () => <span data-testid="file-icon" />,
}))

vi.mock("@/components/shadcn-ui/badge", () => ({
	Badge: ({ children }: PropsWithChildren) => <span>{children}</span>,
}))

vi.mock("@/pages/superMagic/components/LazyGuideTour", () => ({
	GuideTourElementId: { UploadFileButton: "upload-file-button" },
}))

vi.mock("@/components/shadcn-ui/hover-card", () => ({
	HoverCard: ({ children }: PropsWithChildren) => children,
	HoverCardContent: ({ children }: PropsWithChildren) => children,
	HoverCardTrigger: ({ children }: PropsWithChildren) => children,
}))

describe("UploadHoverPanelButton", () => {
	it("rerenders progress when the observable file is updated in place", () => {
		const file = observable({
			id: "file-1",
			name: "demo.pptx",
			file: new File(["demo"], "demo.pptx"),
			status: "uploading" as const,
			progress: 0,
		})
		const fileUploadStore = observable({ files: [file] })

		render(
			<UploadHoverPanelButton
				iconSize={16}
				size="default"
				onFileChange={vi.fn()}
				onRemoveFile={vi.fn()}
				fileUploadStore={fileUploadStore as unknown as FileUploadStore}
				t={(key) => key}
			/>,
		)

		expect(screen.getByText("0%")).toBeInTheDocument()

		act(() => {
			runInAction(() => {
				file.progress = 33
			})
		})

		expect(screen.getByText("33%")).toBeInTheDocument()
		expect(screen.queryByText("0%")).not.toBeInTheDocument()
	})
})
