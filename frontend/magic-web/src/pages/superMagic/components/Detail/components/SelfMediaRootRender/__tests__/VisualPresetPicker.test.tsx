import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { fireEvent, render, screen } from "@testing-library/react"
import React, { type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import VisualPresetPicker from "../components/SelfMediaInitPanel/components/picker/VisualPresetPicker"
import { getVisualPresetsForPlatform } from "../components/SelfMediaInitPanel/types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/base/MagicPromptEditor", () => ({
	MagicPromptEditor: React.forwardRef(
		(
			{
				className,
				bottomToolbar,
			}: {
				className?: string
				bottomToolbar?: ReactNode
			},
			ref,
		) => {
			React.useImperativeHandle(ref, () => ({
				getEditor: () => null,
			}))

			return (
				<div data-testid="visual-custom-editor" className={className}>
					{bottomToolbar}
				</div>
			)
		},
	),
}))

vi.mock("@/components/shadcn-ui/tooltip", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => (
		<div data-testid="legacy-tooltip">{children}</div>
	),
	TooltipTrigger: ({ children }: { children: ReactNode }) => (
		<div data-testid="legacy-tooltip-trigger">{children}</div>
	),
	TooltipContent: ({ children }: { children: ReactNode }) => (
		<div data-testid="legacy-tooltip-content">{children}</div>
	),
}))

vi.mock("../components/SelfMediaInitPanel/components/picker/ReferenceFilePicker", () => ({
	default: ({ label }: { label: string }) => (
		<button type="button" data-testid="visual-reference-picker">
			{label}
		</button>
	),
}))

describe("VisualPresetPicker", () => {
	it("keeps frontend preset choices aligned with self-media-composer built-in previews", () => {
		const rednoteBuiltIns = getVisualPresetsForPlatform("rednote").filter(
			(preset) => !["custom", "none"].includes(preset.value),
		)
		const instagramBuiltIns = getVisualPresetsForPlatform("instagram").filter(
			(preset) => !["custom", "none"].includes(preset.value),
		)
		const rednotePresets = getVisualPresetsForPlatform("rednote")

		expect(rednoteBuiltIns.map((preset) => preset.value)).toEqual([
			"personal-insight",
			"code-dispatch",
			"signal-grid",
			"product-launch-preset",
			"paper-column",
			"gradient-editorial",
			"neo-brutalism",
			"dark-tech",
			"warm-journal",
			"film-vintage",
		])
		expect(instagramBuiltIns.map((preset) => preset.value)).toEqual([
			"ins-modern",
			"ins-minimal",
			"ins-gradient",
			"ins-dark",
			"ins-retro",
		])
		expect(rednotePresets.slice(-2).map((preset) => preset.value)).toEqual(["custom", "none"])

		for (const preset of [...rednoteBuiltIns, ...instagramBuiltIns]) {
			const sourcePath = preset.preview?.sourcePath
			expect(sourcePath).toBeTruthy()
			if (!sourcePath) throw new Error(`${preset.value} preview source missing`)
			expect(existsSync(resolve(process.cwd(), "../../", sourcePath))).toBe(true)
			const imageUrl = preset.preview?.imageUrl
			expect(imageUrl).toBeTruthy()
			if (!imageUrl) throw new Error(`${preset.value} preview image missing`)
			expect(existsSync(resolve(process.cwd(), "public", imageUrl.replace(/^\//, "")))).toBe(
				true,
			)
		}
	})

	it("renders compact layout marks for preset choices", () => {
		const presets = getVisualPresetsForPlatform("rednote").filter((preset) =>
			["neo-brutalism", "code-dispatch", "gradient-editorial", "personal-insight"].includes(
				preset.value,
			),
		)

		render(<VisualPresetPicker presets={presets} value="code-dispatch" onChange={vi.fn()} />)

		for (const preset of presets) {
			expect(
				screen.getByTestId(`visual-preset-layout-mark-${preset.value}`),
			).toBeInTheDocument()
		}
		expect(screen.getByTestId("visual-preset-layout-mark-neo-brutalism")).toHaveAttribute(
			"data-layout-mark-variant",
			"bold-card",
		)
		expect(screen.getByTestId("visual-preset-layout-mark-code-dispatch")).toHaveAttribute(
			"data-layout-mark-variant",
			"dispatch",
		)
		expect(screen.getByTestId("visual-preset-layout-mark-gradient-editorial")).toHaveAttribute(
			"data-layout-mark-variant",
			"editorial",
		)
		expect(screen.getByTestId("visual-preset-layout-mark-personal-insight")).toHaveAttribute(
			"data-layout-mark-variant",
			"insight",
		)
	})

	it("renders a hover/focus long-image preview panel for built-in card presets", () => {
		const preset = getVisualPresetsForPlatform("rednote").find(
			(item) => item.value === "code-dispatch",
		)
		if (!preset) throw new Error("code-dispatch preset missing")

		render(<VisualPresetPicker presets={[preset]} value="code-dispatch" onChange={vi.fn()} />)

		const trigger = screen.getByTestId("visual-preset-option-code-dispatch")
		vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
			bottom: 140,
			height: 40,
			left: 120,
			right: 280,
			top: 100,
			width: 160,
			x: 120,
			y: 100,
			toJSON: () => ({}),
		} as DOMRect)
		fireEvent.mouseEnter(trigger)

		const panel = screen.getByTestId("visual-preset-hover-preview-code-dispatch")

		expect(trigger).toHaveClass("group")
		expect(panel).toHaveClass(
			"fixed",
			"w-[320px]",
			"max-w-[calc(100vw-32px)]",
			"z-[1000]",
			"-translate-y-1/2",
			"opacity-100",
		)
		expect(panel).toHaveAttribute("data-preview-side", "right")
		expect(panel).toHaveAttribute("data-preview-portal", "body")
		expect(panel.parentElement).toBe(document.body)
		expect(panel).toHaveStyle({ left: "288px", top: "120px" })
		expect(panel).not.toHaveClass("absolute", "top-[calc(100%+8px)]", "z-50")
		expect(panel).toHaveAttribute(
			"data-self-media-preset-preview-source",
			"backend/super-magic/agents/skills/self-media-composer/presets/rednote/code-dispatch/preview.html",
		)
		expect(panel).toHaveTextContent("detail.selfMedia.initPanel.visuals.codeDispatch.label")
		expect(panel).toHaveTextContent(
			"detail.selfMedia.initPanel.visuals.codeDispatch.description",
		)
		expect(screen.queryByTestId("legacy-tooltip")).not.toBeInTheDocument()
		expect(screen.queryByTestId("legacy-tooltip-content")).not.toBeInTheDocument()
		expect(screen.queryAllByTestId(/visual-preset-preview-card-code-dispatch-/)).toHaveLength(0)

		const scrollArea = screen.getByTestId("visual-preset-long-image-scroll-code-dispatch")
		const scrollHint = screen.getByTestId("visual-preset-scroll-hint-code-dispatch")
		const image = screen.getByTestId("visual-preset-long-image-code-dispatch")
		const copy = screen.getByTestId("visual-preset-hover-copy-code-dispatch")

		expect(panel).toHaveAttribute(
			"data-self-media-preset-preview-image",
			"/self-media-preset-previews/rednote/code-dispatch.png",
		)
		expect(scrollArea).toHaveClass("overflow-y-auto", "max-h-[min(48vh,360px)]")
		expect(scrollHint).toHaveClass("pointer-events-none", "absolute", "right-2", "top-2")
		expect(scrollHint).toHaveClass(
			"bg-zinc-950/90",
			"text-white",
			"shadow-[0_8px_22px_rgba(24,24,27,0.28)]",
		)
		expect(scrollHint).toHaveTextContent("detail.selfMedia.initPanel.visuals.scrollHint")
		expect(image).toHaveAttribute(
			"src",
			"/self-media-preset-previews/rednote/code-dispatch.png",
		)
		expect(scrollArea.compareDocumentPosition(copy)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
		expect(
			screen.queryByTestId("visual-preset-real-card-code-dispatch-cover"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("visual-preset-real-card-code-dispatch-content"),
		).not.toBeInTheDocument()
	})

	it("uses a scrollable generated long image when a preset preview image is available", () => {
		const preset = getVisualPresetsForPlatform("rednote").find(
			(item) => item.value === "paper-column",
		)
		if (!preset) throw new Error("paper-column preset missing")

		render(<VisualPresetPicker presets={[preset]} value="paper-column" onChange={vi.fn()} />)

		const trigger = screen.getByTestId("visual-preset-option-paper-column")
		vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
			bottom: 140,
			height: 40,
			left: 120,
			right: 280,
			top: 100,
			width: 160,
			x: 120,
			y: 100,
			toJSON: () => ({}),
		} as DOMRect)
		fireEvent.mouseEnter(trigger)

		const panel = screen.getByTestId("visual-preset-hover-preview-paper-column")
		const scrollArea = screen.getByTestId("visual-preset-long-image-scroll-paper-column")
		const scrollHint = screen.getByTestId("visual-preset-scroll-hint-paper-column")
		const image = screen.getByTestId("visual-preset-long-image-paper-column")

		expect(panel).toHaveAttribute(
			"data-self-media-preset-preview-image",
			"/self-media-preset-previews/rednote/paper-column.png",
		)
		expect(scrollArea).toHaveClass("overflow-y-auto", "max-h-[min(48vh,360px)]")
		expect(scrollHint).toHaveTextContent("detail.selfMedia.initPanel.visuals.scrollHint")
		expect(image).toHaveAttribute("src", "/self-media-preset-previews/rednote/paper-column.png")
		expect(
			screen.queryByTestId("visual-preset-real-card-paper-column-cover"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("visual-preset-real-card-paper-column-content"),
		).not.toBeInTheDocument()
	})

	it("opens the preview to the left for presets in the right edge column", () => {
		const presets = getVisualPresetsForPlatform("rednote").slice(0, 3)
		const rightEdgePreset = presets[2]
		if (!rightEdgePreset) throw new Error("right edge preset missing")

		render(
			<VisualPresetPicker
				presets={presets}
				value={rightEdgePreset.value}
				onChange={vi.fn()}
			/>,
		)

		const trigger = screen.getByTestId(`visual-preset-option-${rightEdgePreset.value}`)
		vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
			bottom: 140,
			height: 40,
			left: 760,
			right: 920,
			top: 100,
			width: 160,
			x: 760,
			y: 100,
			toJSON: () => ({}),
		} as DOMRect)
		fireEvent.mouseEnter(trigger)

		const rightEdgePanel = screen.getByTestId(
			`visual-preset-hover-preview-${rightEdgePreset.value}`,
		)

		expect(rightEdgePanel).toHaveAttribute("data-preview-side", "left")
		expect(rightEdgePanel).toHaveClass("fixed", "-translate-y-1/2", "z-[1000]", "opacity-100")
		expect(rightEdgePanel).toHaveAttribute("data-preview-portal", "body")
		expect(rightEdgePanel.parentElement).toBe(document.body)
		expect(rightEdgePanel).toHaveStyle({ left: "432px", top: "120px" })
	})

	it("keeps the preview open long enough to move from the trigger into the floating panel", () => {
		vi.useFakeTimers()
		try {
			const preset = getVisualPresetsForPlatform("rednote").find(
				(item) => item.value === "paper-column",
			)
			if (!preset) throw new Error("paper-column preset missing")

			render(
				<VisualPresetPicker presets={[preset]} value="paper-column" onChange={vi.fn()} />,
			)

			const trigger = screen.getByTestId("visual-preset-option-paper-column")
			vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
				bottom: 140,
				height: 40,
				left: 120,
				right: 280,
				top: 100,
				width: 160,
				x: 120,
				y: 100,
				toJSON: () => ({}),
			} as DOMRect)
			fireEvent.mouseEnter(trigger)

			const panel = screen.getByTestId("visual-preset-hover-preview-paper-column")
			fireEvent.mouseLeave(trigger)
			vi.advanceTimersByTime(250)

			expect(
				screen.getByTestId("visual-preset-hover-preview-paper-column"),
			).toBeInTheDocument()

			fireEvent.mouseEnter(panel)
			vi.advanceTimersByTime(120)

			expect(
				screen.getByTestId("visual-preset-hover-preview-paper-column"),
			).toBeInTheDocument()
		} finally {
			vi.useRealTimers()
		}
	})

	it("renders generated long-image previews for every built-in template preview", () => {
		const builtIns = [
			...getVisualPresetsForPlatform("rednote"),
			...getVisualPresetsForPlatform("instagram"),
		].filter((preset) => !["custom", "none"].includes(preset.value))

		for (const preset of builtIns) {
			const { unmount } = render(
				<VisualPresetPicker presets={[preset]} value={preset.value} onChange={vi.fn()} />,
			)
			const trigger = screen.getByTestId(`visual-preset-option-${preset.value}`)
			vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
				bottom: 140,
				height: 40,
				left: 120,
				right: 280,
				top: 100,
				width: 160,
				x: 120,
				y: 100,
				toJSON: () => ({}),
			} as DOMRect)
			fireEvent.mouseEnter(trigger)

			if (preset.preview?.imageUrl) {
				const scrollArea = screen.getByTestId(
					`visual-preset-long-image-scroll-${preset.value}`,
				)
				const image = screen.getByTestId(`visual-preset-long-image-${preset.value}`)
				expect(scrollArea).toHaveClass("overflow-y-auto")
				expect(image).toHaveAttribute("src", preset.preview.imageUrl)
				expect(
					screen.queryByTestId(`visual-preset-real-card-${preset.value}-cover`),
				).not.toBeInTheDocument()
				expect(
					screen.queryByTestId(`visual-preset-real-card-${preset.value}-content`),
				).not.toBeInTheDocument()
				unmount()
				continue
			}

			const coverCard = screen.getByTestId(`visual-preset-real-card-${preset.value}-cover`)
			const contentCard = screen.getByTestId(
				`visual-preset-real-card-${preset.value}-content`,
			)

			expect(coverCard).toHaveAttribute("data-preview-layout", "cover")
			expect(contentCard).toHaveAttribute("data-preview-layout", "content")
			expect(contentCard).toHaveAttribute("data-preview-content-block", "true")
			expect(coverCard.innerHTML).not.toEqual(contentCard.innerHTML)

			unmount()
		}
	})

	it("keeps preset cards and custom input on a low-border surface", () => {
		render(
			<VisualPresetPicker
				presets={[
					{
						value: "custom",
						labelKey: "Custom",
						descriptionKey: "Custom description",
						platforms: ["rednote"],
					},
					{
						value: "none",
						labelKey: "No template",
						descriptionKey: "No template description",
						platforms: ["rednote"],
					},
				]}
				value="custom"
				onChange={vi.fn()}
				onCustomDescriptionChange={vi.fn()}
				onVisualReferenceFilesChange={vi.fn()}
			/>,
		)

		const selectedPreset = screen.getByRole("button", { name: /Custom/ })
		const editor = screen.getByTestId("visual-custom-editor")
		const picker = screen.getByTestId("visual-reference-picker")

		expect(selectedPreset).toHaveClass("border-0", "shadow-none", "ring-1")
		expect(selectedPreset).not.toHaveClass("border-primary", "shadow-xs")
		expect(editor).toHaveClass("rounded-none", "border-0", "border-b", "focus-within:ring-0")
		expect(picker.parentElement).toHaveClass("border-t", "bg-zinc-50/40")
	})
})
