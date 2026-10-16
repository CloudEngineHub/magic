import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import {
	EnterpriseInfoWatermarkForm,
	EnterpriseInfoWatermarkPreview,
} from "../../../enterprise/src/features/enterprise-info/components/enterprise-info-watermark"
import { createDefaultIdentityWatermark } from "../../../src/components/identity-watermark/watermark-utils"

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const noop = () => undefined

describe("enterprise info watermark section", () => {
	it("renders the enterprise copy instead of the platform copy in read-only mode", () => {
		render(
			<EnterpriseInfoWatermarkPreview
				value={{ enabled: true, fields: ["real_name", "phone"], depth: "strong" }}
				onRetry={noop}
			/>,
		)

		expect(screen.getByText("enterpriseInfo.watermark.field.enabled")).toBeInTheDocument()
		expect(screen.getByText("enterpriseInfo.watermark.field.realName")).toBeInTheDocument()
		expect(screen.getByText("enterpriseInfo.watermark.depth.strong")).toBeInTheDocument()
		expect(screen.getByText("enterpriseInfo.watermark.preview.tip")).toBeInTheDocument()
		expect(screen.queryByText("platformInfo.watermark.field.realName")).not.toBeInTheDocument()
		expect(screen.queryByText("platformInfo.watermark.preview.tip")).not.toBeInTheDocument()
	})

	it("edits the watermark through the shared form and keeps content disabled while off", () => {
		function Harness() {
			const [value, setValue] = useState(createDefaultIdentityWatermark())

			return (
				<EnterpriseInfoWatermarkForm value={value} onChange={setValue} onRetry={noop} />
			)
		}

		render(<Harness />)

		expect(
			screen.getByRole("checkbox", { name: "enterpriseInfo.watermark.field.realName" }),
		).toBeDisabled()

		fireEvent.click(screen.getByRole("switch"))

		expect(
			screen.getByRole("checkbox", { name: "enterpriseInfo.watermark.field.realName" }),
		).toBeEnabled()
		expect(screen.getByText("enterpriseInfo.watermark.preview.title")).toBeInTheDocument()
	})

	it("shows the load error with a retry entry instead of the form when reading fails", () => {
		render(
			<EnterpriseInfoWatermarkForm
				error="42003"
				value={createDefaultIdentityWatermark()}
				onChange={noop}
				onRetry={noop}
			/>,
		)

		expect(screen.getByText("enterpriseInfo.error.watermarkLoadTitle")).toBeInTheDocument()
		expect(screen.getByText("42003")).toBeInTheDocument()
		expect(screen.getByText("common.refresh")).toBeInTheDocument()
		// 读取失败时不渲染表单，避免用默认值覆盖已有配置。
		expect(screen.queryByRole("switch")).not.toBeInTheDocument()
	})
})
