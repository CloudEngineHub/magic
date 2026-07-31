import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import magicToast from "@/components/base/MagicToaster/utils"
import { useExportProgressToast } from "../hooks/useExportProgressToast"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			key === "detail.selfMedia.export.pageSeparator"
				? "、"
				: options
					? `${key}:${JSON.stringify(options)}`
					: key,
	}),
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		loading: vi.fn(),
		success: vi.fn(),
		error: vi.fn(),
	},
}))

describe("useExportProgressToast", () => {
	it("shows exported count and missing page numbers for a partial success", () => {
		renderHook(() =>
			useExportProgressToast(
				{
					current: 8,
					total: 8,
					status: "done",
					exported: 6,
					failedPageNumbers: [3, 7],
				},
				"rednote-export",
			),
		)

		expect(magicToast.success).toHaveBeenCalledWith({
			key: "rednote-export",
			content:
				'detail.selfMedia.export.partialSuccess:{"exported":6,"total":8,"failedPages":"3、7"}',
		})
		expect(magicToast.error).not.toHaveBeenCalled()
	})
})
