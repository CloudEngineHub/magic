import { act, createRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DetailType } from "@/pages/superMagic/components/Detail/types"
import PreviewDetailPopup, { type PreviewDetailPopupRef } from ".."

const testState = vi.hoisted(() => ({ isMobile: false }))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => testState.isMobile,
}))

vi.mock("react-router", () => ({
	useLocation: () => ({ pathname: "/project", search: "" }),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("antd-mobile", () => ({
	Toast: { show: vi.fn() },
}))

vi.mock("@/pages/superMagic/components/Detail/hooks/useDetailActions", async () => {
	const React = await import("react")

	return {
		useDetailActions: () => {
			const [isFullscreen, setIsFullscreen] = React.useState(false)

			React.useEffect(() => {
				const handleKeyDown = (event: KeyboardEvent) => {
					if (event.key === "Escape" && isFullscreen) setIsFullscreen(false)
				}
				document.addEventListener("keydown", handleKeyDown)
				return () => document.removeEventListener("keydown", handleKeyDown)
			}, [isFullscreen])

			return {
				isFullscreen,
				setIsFullscreen,
				isFromNode: false,
				handlePrevious: vi.fn(),
				handleNext: vi.fn(),
				handleFullscreen: () => setIsFullscreen((current) => !current),
				handleDownload: vi.fn(),
				allFiles: [],
				currentIndex: 0,
				effectiveAttachments: [],
			}
		},
	}
})

vi.mock("@/pages/superMagic/components/Detail/components/FilesViewer/utils/preview", () => ({
	correctDetailType: (detail: unknown) => detail,
}))

vi.mock("@/pages/superMagic/utils/share", () => ({ copyFileContent: vi.fn() }))

vi.mock("@/pages/superMagic/utils/handleFIle", () => ({
	getFileType: () => DetailType.Code,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/MessageAttachment/utils", () => ({
	getAttachmentExtension: () => "",
}))

vi.mock("@/components/base/MagicFileIcon", () => ({ default: () => <span /> }))
vi.mock("@/pages/superMagic/components/MessageList/components/Tool/components/ToolIcon", () => ({
	default: () => <span />,
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({ children, visible }: { children: React.ReactNode; visible?: boolean }) =>
		visible ? <div data-testid="magic-popup">{children}</div> : null,
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: ({
		children,
		open,
		className,
		classNames,
		title,
		centered,
		closable,
		onCancel,
	}: {
		children: React.ReactNode
		open?: boolean
		className?: string
		classNames?: { content?: string; body?: string; header?: string }
		title?: React.ReactNode
		centered?: boolean
		closable?: boolean
		onCancel?: () => void
	}) =>
		open ? (
			<div
				data-testid="magic-modal"
				className={className}
				data-content-class={classNames?.content}
				data-body-class={classNames?.body}
				data-header-class={classNames?.header}
				data-centered={String(centered)}
				data-closable={String(closable)}
			>
				{title ? <div data-testid="magic-modal-title">{title}</div> : null}
				<button data-testid="magic-modal-cancel" onClick={onCancel} />
				{children}
			</div>
		) : null,
}))

vi.mock("@/pages/superMagic/components/Detail/Render", () => ({
	default: ({
		isFullscreen,
		onFullscreen,
	}: {
		isFullscreen?: boolean
		onFullscreen?: () => void
	}) => (
		<div data-testid="preview-render" data-fullscreen={String(isFullscreen)}>
			<button data-testid="preview-fullscreen" onClick={onFullscreen} />
		</div>
	),
}))

function openPreview(ref: React.RefObject<PreviewDetailPopupRef | null>) {
	return act(async () => {
		ref.current?.open(
			{
				type: DetailType.Code,
				currentFileId: "file-1",
				data: {
					file_id: "file-1",
					file_name: "file.ts",
					file_extension: "ts",
				},
			},
			[],
			[],
		)
	})
}

describe("PreviewDetailPopup fullscreen", () => {
	it("preserves the share header offset after migrating the container styles", () => {
		const { rerender } = render(
			<PreviewDetailPopup isFileShare setUserSelectDetail={vi.fn()} />,
		)

		expect(screen.getByTestId("share-preview-detail-popup-root")).toHaveClass("mt-[52px]")
		expect(screen.getByTestId("share-preview-detail-popup-root")).toHaveClass(
			"h-[calc(100%_-_52px)]",
		)

		rerender(<PreviewDetailPopup isFileShare hideHeader setUserSelectDetail={vi.fn()} />)

		expect(screen.getByTestId("share-preview-detail-popup-root")).not.toHaveClass("mt-[52px]")
		expect(screen.getByTestId("share-preview-detail-popup-root")).toHaveClass("h-full")
	})

	it("expands the desktop modal shell with the preview fullscreen state", async () => {
		const popupRef = createRef<PreviewDetailPopupRef>()
		render(<PreviewDetailPopup ref={popupRef} setUserSelectDetail={vi.fn()} />)
		await openPreview(popupRef)

		expect(screen.getByTestId("magic-modal").className).toContain("!w-[80vw]")
		expect(screen.getByTestId("magic-modal").className).not.toContain("!h-[100dvh]")
		expect(screen.getByTestId("preview-render")).toHaveAttribute("data-fullscreen", "false")

		await act(async () => {
			fireEvent.click(screen.getByTestId("preview-fullscreen"))
		})

		const modal = screen.getByTestId("magic-modal")
		expect(modal.className).toContain("!top-0")
		expect(modal.className).toContain("!h-[100dvh]")
		expect(modal.className).toContain("!w-screen")
		expect(modal.getAttribute("data-content-class")).toContain("!h-[100dvh]")
		expect(modal.getAttribute("data-body-class")).toContain("!h-full")
		expect(modal).toHaveAttribute("data-centered", "false")
		expect(modal).toHaveAttribute("data-closable", "false")
		expect(screen.queryByTestId("magic-modal-title")).not.toBeInTheDocument()
		expect(screen.getByTestId("preview-render")).toHaveAttribute("data-fullscreen", "true")

		await act(async () => {
			fireEvent.click(screen.getByTestId("preview-fullscreen"))
		})
		expect(screen.getByTestId("magic-modal").className).not.toContain("!h-[100dvh]")
		expect(screen.getByTestId("preview-render")).toHaveAttribute("data-fullscreen", "false")
	})

	it("uses Escape to leave fullscreen without closing the popup", async () => {
		const popupRef = createRef<PreviewDetailPopupRef>()
		render(<PreviewDetailPopup ref={popupRef} setUserSelectDetail={vi.fn()} />)
		await openPreview(popupRef)

		await act(async () => {
			fireEvent.click(screen.getByTestId("preview-fullscreen"))
		})
		fireEvent.keyDown(document, { key: "Escape" })

		expect(screen.getByTestId("magic-modal")).toBeInTheDocument()
		expect(screen.getByTestId("preview-render")).toHaveAttribute("data-fullscreen", "false")
	})

	it("clears fullscreen state when closing and reopening the preview", async () => {
		const popupRef = createRef<PreviewDetailPopupRef>()
		render(<PreviewDetailPopup ref={popupRef} setUserSelectDetail={vi.fn()} />)
		await openPreview(popupRef)

		await act(async () => {
			fireEvent.click(screen.getByTestId("preview-fullscreen"))
			fireEvent.click(screen.getByTestId("magic-modal-cancel"))
		})
		expect(screen.queryByTestId("magic-modal")).not.toBeInTheDocument()

		await openPreview(popupRef)
		expect(screen.getByTestId("magic-modal").className).not.toContain("!h-[100dvh]")
		expect(screen.getByTestId("preview-render")).toHaveAttribute("data-fullscreen", "false")
	})
})
