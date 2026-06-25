import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

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
		error: vi.fn(),
	},
}))

vi.mock("../components/SelfMediaInitPanel/components/ui/InlineVoiceButton", () => ({
	default: () => <button type="button" data-testid="inline-voice-button" />,
}))

vi.mock("../components/SelfMediaInitPanel/hooks/useBrandImagePreviewHydration", () => ({
	useBrandImagePreviewHydration: () => ({ hydratingImageIds: new Set() }),
}))

vi.mock("../components/SelfMediaInitPanel/steps/StepBrandInfo/components/BrandAssetUpload", () => ({
	BrandAssetUpload: ({ layout }: { layout?: string }) => (
		<div data-layout={layout} data-testid="brand-asset-upload" />
	),
}))

import { BrandInfoFields } from "../components/SelfMediaInitPanel/steps/StepBrandInfo/components/BrandInfoFields"

describe("BrandInfoFields wizard style", () => {
	it("reuses the shared brand form layout in the first init step", () => {
		render(
			<BrandInfoFields
				author=""
				brandPosition=""
				targetAudience=""
				brandImages={[]}
				onChange={vi.fn()}
				onBrandImagesChange={vi.fn()}
				fileStorageService={null}
				attachmentList={[]}
			/>,
		)

		const layout = screen.getByTestId("self-media-brand-config-settings-layout")

		expect(layout).toBeInTheDocument()
		expect(layout).toHaveAttribute("data-layout", "wizard")
		expect(layout).toHaveClass("lg:grid-cols-[minmax(0,1fr)_19rem]")
		expect(screen.queryByTestId("self-media-brand-info-wizard-panel")).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-brand-field-author")).not.toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-config-profile-card")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-config-assets-card")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-config-profile-card").className).not.toContain(
			"#434c81",
		)
		expect(screen.queryByText("账号档案")).not.toBeInTheDocument()
		expect(
			screen.queryByText("配置 AI 生成内容时默认使用的身份、定位与受众。"),
		).not.toBeInTheDocument()
		expect(screen.queryByText("#AI分享")).not.toBeInTheDocument()
		expect(screen.queryByText("账号与品牌信息")).not.toBeInTheDocument()
		expect(
			screen.queryByText("填写默认账号、定位和素材，让后续选题与成文保持统一口吻。"),
		).not.toBeInTheDocument()
		expect(screen.queryByText("上传 Logo、IP 形象或风格参考图。")).not.toBeInTheDocument()
		expect(screen.getByTestId("self-media-brand-config-assets-card")).not.toHaveTextContent("0")
		expect(screen.getByTestId("brand-asset-upload")).toHaveAttribute("data-layout", "stacked")
	})
})
