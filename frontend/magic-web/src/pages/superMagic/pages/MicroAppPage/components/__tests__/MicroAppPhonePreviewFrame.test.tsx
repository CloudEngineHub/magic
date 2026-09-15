import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import MicroAppPhonePreviewFrame from "../MicroAppPhonePreviewFrame"

const phoneFrameMocks = vi.hoisted(() => ({
	usePhoneScaling: vi.fn(() => ({
		containerRef: { current: null },
		scale: 0.5,
		width: 421,
		height: 880,
	})),
}))

vi.mock("@/pages/superMagic/components/Detail/hooks/usePhoneScaling", () => ({
	usePhoneScaling: phoneFrameMocks.usePhoneScaling,
}))

vi.mock("@/pages/superMagic/components/Detail/components/PhoneShell", () => ({
	default: ({ children }: { children: ReactNode }) => (
		<div data-testid="shared-phone-shell">{children}</div>
	),
}))

describe("MicroAppPhonePreviewFrame", () => {
	it("reuses the shared phone shell and scales it to the preview area", () => {
		render(
			<MicroAppPhonePreviewFrame>
				<div data-testid="phone-preview-content" />
			</MicroAppPhonePreviewFrame>,
		)

		expect(phoneFrameMocks.usePhoneScaling).toHaveBeenCalledWith({
			designWidth: 421,
			designHeight: 880,
			padding: 32,
		})
		expect(screen.getByTestId("micro-app-phone-preview-frame")).toBeInTheDocument()
		expect(screen.getByTestId("shared-phone-shell")).toContainElement(
			screen.getByTestId("phone-preview-content"),
		)
	})
})
