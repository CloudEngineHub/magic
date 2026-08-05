import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useHtmlAppPermissions } from "../useHtmlAppPermissions"

const mocks = vi.hoisted(() => ({
	getIframeDownloadUrl: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	initReactI18next: { type: "3rdParty", init: vi.fn() },
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: { confirm: vi.fn() },
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: { warning: vi.fn() },
}))

vi.mock("@/components/shadcn-ui/select", () => ({
	Select: ({ children }: { children: React.ReactNode }) => children,
	SelectContent: ({ children }: { children: React.ReactNode }) => children,
	SelectItem: ({ children }: { children: React.ReactNode }) => children,
	SelectTrigger: ({ children }: { children: React.ReactNode }) => children,
	SelectValue: () => null,
}))

vi.mock("@/models/user", () => ({
	userStore: { user: { userInfo: null } },
}))

vi.mock("../../iframe-api/iframeApi", () => ({
	getIframeDownloadUrl: mocks.getIframeDownloadUrl,
}))

describe("useHtmlAppPermissions", () => {
	let originalFetch: typeof globalThis.fetch

	beforeEach(() => {
		originalFetch = globalThis.fetch
		mocks.getIframeDownloadUrl.mockReset()
		mocks.getIframeDownloadUrl.mockResolvedValue([
			{ url: "https://files.example.com/app.json" },
		])
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ type: "micro-app", name: "Test App" }),
		}) as unknown as typeof globalThis.fetch
	})

	afterEach(() => {
		globalThis.fetch = originalFetch
	})

	it("keeps loaded app config when an unrelated file changes", async () => {
		const appConfigFile = {
			file_id: "app-config",
			relative_file_path: "app/app.json",
			updated_at: "2026-08-05 10:00:00",
		}
		const initialDataFile = {
			file_id: "data-file",
			relative_file_path: "app/data.json",
			updated_at: "2026-08-05 10:00:00",
		}
		const { result, rerender } = renderHook(
			({ fileList }) =>
				useHtmlAppPermissions({
					content: "<html></html>",
					relativeFilePath: "app/index.html",
					projectId: "project-1",
					fileList,
				}),
			{
				initialProps: { fileList: [appConfigFile, initialDataFile] },
			},
		)

		await waitFor(() => {
			expect(result.current.htmlAppConfigState.status).toBe("loaded")
		})

		mocks.getIframeDownloadUrl.mockReturnValueOnce(new Promise(() => undefined))
		rerender({
			fileList: [
				appConfigFile,
				{
					...initialDataFile,
					updated_at: "2026-08-05 10:01:00",
				},
			],
		})

		expect(result.current.htmlAppConfigState.status).toBe("loaded")
		expect(mocks.getIframeDownloadUrl).toHaveBeenCalledTimes(1)
	})

	it("reloads app config when app.json changes", async () => {
		const appConfigFile = {
			file_id: "app-config",
			relative_file_path: "app/app.json",
			updated_at: "2026-08-05 10:00:00",
		}
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ type: "micro-app", name: "Initial App" }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ type: "micro-app", name: "Updated App" }),
			})
		globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
		const { result, rerender } = renderHook(
			({ fileList }) =>
				useHtmlAppPermissions({
					content: "<html></html>",
					relativeFilePath: "app/index.html",
					projectId: "project-1",
					fileList,
				}),
			{
				initialProps: { fileList: [appConfigFile] },
			},
		)

		await waitFor(() => {
			expect(result.current.htmlAppConfig?.name).toBe("Initial App")
		})

		rerender({
			fileList: [
				{
					...appConfigFile,
					updated_at: "2026-08-05 10:01:00",
				},
			],
		})

		await waitFor(() => {
			expect(result.current.htmlAppConfig?.name).toBe("Updated App")
		})
		expect(mocks.getIframeDownloadUrl).toHaveBeenCalledTimes(2)
	})
})
