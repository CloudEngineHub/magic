import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const { mockMessageError, mockUseSelfMediaBrandConfig } = vi.hoisted(() => ({
	mockMessageError: vi.fn(),
	mockUseSelfMediaBrandConfig: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (_key: string, fallback?: string) => fallback || _key,
	}),
}))

vi.mock("antd", () => ({
	message: {
		error: mockMessageError,
	},
}))

vi.mock("../hooks/useSelfMediaBrandConfig", () => ({
	useSelfMediaBrandConfig: mockUseSelfMediaBrandConfig,
}))

vi.mock("../components/SelfMediaInitPanel/steps/StepBrandInfo/components/BrandAssetUpload", () => ({
	BrandAssetUpload: ({ layout }: { layout?: string }) => (
		<div data-layout={layout} data-testid="brand-asset-upload" />
	),
}))

vi.mock("../components/SelfMediaInitPanel/components/ui/InlineVoiceButton", () => ({
	default: () => <button type="button" data-testid="inline-voice-button" />,
}))

vi.mock("../components/SelfMediaInitPanel/hooks/useBrandImagePreviewHydration", () => ({
	useBrandImagePreviewHydration: () => ({ hydratingImageIds: new Set() }),
}))

import BrandConfigDialog from "../components/BrandConfigDialog"

describe("BrandConfigDialog style", () => {
	it("uses a quiet settings surface without copying the home hero card", () => {
		mockUseSelfMediaBrandConfig.mockReturnValue({
			settings: {
				author: "Magic Lab",
				brandPosition: "AI tools",
				targetAudience: "Creators",
				brandImages: [],
			},
			saveSettings: vi.fn(),
			isLoading: false,
			isSaving: false,
		})

		render(<BrandConfigDialog open onOpenChange={vi.fn()} fileStorageService={null} />)

		const dialog = screen.getByTestId("self-media-brand-config-dialog")

		expect(dialog).toHaveClass("!max-w-5xl")
		expect(dialog).toHaveClass("bg-[#f8f8f9]")
		expect(screen.getByTestId("self-media-brand-config-header")).toHaveClass("px-6")
		expect(screen.getByText("detail.selfMedia.brandConfig.title")).toHaveClass(
			"text-2xl",
			"font-[780]",
		)
		expect(screen.getByTestId("self-media-brand-config-settings-layout")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-config-settings-layout")).toHaveAttribute(
			"data-layout",
			"settings",
		)
		expect(screen.getByTestId("self-media-brand-config-settings-layout")).not.toHaveClass(
			"rounded-[24px]",
		)
		expect(screen.getByTestId("self-media-brand-config-settings-layout")).not.toHaveClass(
			"bg-white/90",
		)
		expect(screen.getByTestId("self-media-brand-config-profile-card")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-config-profile-card")).toHaveClass(
			"rounded-[20px]",
			"border-[#18181b]/[0.06]",
			"bg-white",
		)
		expect(screen.getByTestId("self-media-brand-config-profile-card").className).not.toContain(
			"linear-gradient",
		)
		expect(screen.getByTestId("self-media-brand-config-assets-card")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-config-assets-card")).toHaveClass(
			"rounded-[20px]",
			"border-[#18181b]/[0.06]",
			"bg-white",
		)
		expect(screen.getByTestId("self-media-brand-config-assets-card")).not.toHaveClass(
			"backdrop-blur",
		)
		expect(screen.getByText("账号档案")).toBeInTheDocument()
		expect(
			screen.getByText("配置 AI 生成内容时默认使用的身份、定位与受众。"),
		).toBeInTheDocument()
		expect(screen.getByText("#AI分享")).toBeInTheDocument()
		expect(screen.getByText("上传 Logo、IP 形象或风格参考图。")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-config-assets-card")).toHaveTextContent("0")
		expect(screen.getByTestId("brand-asset-upload")).toHaveAttribute("data-layout", "stacked")
		expect(screen.getByTestId("self-media-brand-config-save-button")).toHaveClass(
			"rounded-[25px]",
			"bg-[#18181b]",
		)
	})

	it("keeps the dialog open and surfaces an error when saving brand config fails", async () => {
		const saveSettings = vi.fn().mockRejectedValue(new Error("save failed"))
		const onOpenChange = vi.fn()
		mockMessageError.mockReset()
		mockUseSelfMediaBrandConfig.mockReturnValue({
			settings: {
				author: "Magic Lab",
				brandPosition: "AI tools",
				targetAudience: "Creators",
				brandImages: [],
			},
			saveSettings,
			isLoading: false,
			isSaving: false,
		})

		render(<BrandConfigDialog open onOpenChange={onOpenChange} fileStorageService={null} />)

		fireEvent.click(screen.getByTestId("self-media-brand-config-save-button"))

		await waitFor(() => {
			expect(saveSettings).toHaveBeenCalled()
		})
		expect(onOpenChange).not.toHaveBeenCalledWith(false)
		expect(mockMessageError).toHaveBeenCalledWith("detail.selfMedia.brandConfig.saveError")
	})

	it("preserves draft edits typed while an older save is still in flight", async () => {
		let hookState = {
			settings: {
				author: "Magic Lab",
				brandPosition: "AI tools",
				targetAudience: "Creators",
				brandImages: [],
			},
			saveSettings: vi.fn().mockResolvedValue(undefined),
			isLoading: false,
			isSaving: false,
		}
		mockUseSelfMediaBrandConfig.mockImplementation(() => hookState)
		const onOpenChange = vi.fn()

		const { rerender } = render(
			<BrandConfigDialog open onOpenChange={onOpenChange} fileStorageService={null} />,
		)

		const accountInput = screen.getByPlaceholderText("如：@超级麦吉")
		fireEvent.change(accountInput, { target: { value: "Saved snapshot" } })
		fireEvent.click(screen.getByTestId("self-media-brand-config-save-button"))

		await waitFor(() => {
			expect(hookState.saveSettings).toHaveBeenCalledWith(
				expect.objectContaining({ author: "Saved snapshot" }),
			)
		})

		fireEvent.change(accountInput, { target: { value: "Typed during save" } })
		expect(accountInput).toHaveValue("Typed during save")

		hookState = {
			...hookState,
			settings: hookState.saveSettings.mock.calls[0][0],
			isSaving: false,
		}
		rerender(<BrandConfigDialog open onOpenChange={onOpenChange} fileStorageService={null} />)

		expect(screen.getByPlaceholderText("如：@超级麦吉")).toHaveValue("Typed during save")
	})
})
