import { act, fireEvent, render, screen } from "@testing-library/react"
import { useEffect, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import type { AttachmentItem } from "../hooks/types"
import {
	ProjectFileImagePreviewProvider,
	resolveProjectFileImagePreviewSource,
	useProjectFileImagePreviewManager,
} from "./ProjectFileImagePreviewProvider"
import { ProjectFileImageSmartTooltip } from "./ProjectFileImageSmartTooltip"
import { __resetProjectFileImagePreviewCoordinatorForTests } from "./projectFileImagePreviewCoordinator"
import { __resetProjectFileImagePreviewRuntimeForTests } from "./projectFileImagePreviewRuntime"

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn(),
}))

vi.mock("@/components/other/SmartTooltip", () => ({
	default: ({
		children,
		content,
		forceShowTooltip,
		onOpenChange,
	}: {
		children?: ReactNode
		content?: ReactNode
		forceShowTooltip?: boolean
		onOpenChange?: (open: boolean) => void
	}) => (
		<div
			data-testid="smart-tooltip"
			data-force-show={String(Boolean(forceShowTooltip))}
			data-has-custom-content={String(content !== undefined && content !== null)}
		>
			<span>{children}</span>
			<button type="button" onClick={() => onOpenChange?.(true)}>
				open
			</button>
			{content}
		</div>
	),
}))

function PreviewHarness({ item, children }: { item: AttachmentItem; children: ReactNode }) {
	const manager = useProjectFileImagePreviewManager({ attachments: [item] })

	useEffect(() => {
		manager.setMountedItems([item])
	}, [item, manager.setMountedItems])

	return (
		<ProjectFileImagePreviewProvider manager={manager}>
			{children}
		</ProjectFileImagePreviewProvider>
	)
}

describe("ProjectFileImageSmartTooltip", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.mocked(getTemporaryDownloadUrl).mockReset()
		__resetProjectFileImagePreviewCoordinatorForTests()
		__resetProjectFileImagePreviewRuntimeForTests()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("falls back to the regular name tooltip after preview image loading fails", async () => {
		const item: AttachmentItem = {
			file_id: "tooltip-image-error",
			file_name: "tooltip-image-error.png",
			file_extension: "png",
		}
		const source = resolveProjectFileImagePreviewSource(item)
		if (!source) throw new Error("Expected an image preview source")
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce([
			{
				file_id: item.file_id || "",
				url: "https://cdn.example.com/tooltip-image-error.webp",
				expires_at: "2099-01-01 00:00:00",
			},
		])

		render(
			<PreviewHarness item={item}>
				<ProjectFileImageSmartTooltip source={source}>
					{item.file_name}
				</ProjectFileImageSmartTooltip>
			</PreviewHarness>,
		)
		await act(async () => {
			vi.advanceTimersByTime(32)
			await Promise.resolve()
		})

		fireEvent.error(screen.getByTestId("project-file-image-preview-tooltip-image"))

		expect(screen.getByTestId("smart-tooltip")).toHaveAttribute("data-force-show", "false")
		expect(screen.getByTestId("smart-tooltip")).toHaveAttribute(
			"data-has-custom-content",
			"false",
		)
		expect(screen.getByText("tooltip-image-error.png")).toBeInTheDocument()
	})

	it("falls back to the regular name tooltip when no preview url is available", async () => {
		const item: AttachmentItem = {
			file_id: "tooltip-exchange-error",
			file_name: "tooltip-exchange-error.png",
			file_extension: "png",
		}
		const source = resolveProjectFileImagePreviewSource(item)
		if (!source) throw new Error("Expected an image preview source")
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce([])

		render(
			<PreviewHarness item={item}>
				<ProjectFileImageSmartTooltip source={source}>
					{item.file_name}
				</ProjectFileImageSmartTooltip>
			</PreviewHarness>,
		)
		await act(async () => {
			vi.advanceTimersByTime(32)
			await Promise.resolve()
		})

		expect(screen.getByTestId("smart-tooltip")).toHaveAttribute("data-force-show", "false")
		expect(screen.getByTestId("smart-tooltip")).toHaveAttribute(
			"data-has-custom-content",
			"false",
		)

		fireEvent.click(screen.getByRole("button", { name: "open" }))
		await act(async () => {
			vi.advanceTimersByTime(200)
			await Promise.resolve()
		})
		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
	})

	it("retries a failed url exchange when the tooltip opens again", async () => {
		const item: AttachmentItem = {
			file_id: "tooltip-exchange-retry",
			file_name: "tooltip-exchange-retry.png",
			file_extension: "png",
		}
		const source = resolveProjectFileImagePreviewSource(item)
		if (!source) throw new Error("Expected an image preview source")
		vi.mocked(getTemporaryDownloadUrl)
			.mockRejectedValueOnce(new Error("temporary exchange failure"))
			.mockResolvedValueOnce([
				{
					file_id: item.file_id || "",
					url: "https://cdn.example.com/tooltip-exchange-retry.webp",
					expires_at: "2099-01-01 00:00:00",
				},
			])

		render(
			<PreviewHarness item={item}>
				<ProjectFileImageSmartTooltip source={source}>
					{item.file_name}
				</ProjectFileImageSmartTooltip>
			</PreviewHarness>,
		)
		await act(async () => {
			vi.advanceTimersByTime(32)
			await Promise.resolve()
		})

		expect(screen.getByTestId("smart-tooltip")).toHaveAttribute("data-force-show", "false")

		fireEvent.click(screen.getByRole("button", { name: "open" }))
		await act(async () => {
			vi.advanceTimersByTime(80)
			await Promise.resolve()
		})

		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(2)
		expect(screen.getByTestId("project-file-image-preview-tooltip-image")).toHaveAttribute(
			"src",
			"https://cdn.example.com/tooltip-exchange-retry.webp",
		)
	})
})
