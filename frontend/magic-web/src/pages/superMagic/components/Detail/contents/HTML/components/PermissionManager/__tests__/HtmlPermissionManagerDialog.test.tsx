import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { HtmlPermissionSnapshot } from "../../../iframe-api/services/IframePermissionService"
import HtmlPermissionManagerDialog, {
	createHtmlPermissionDateFormatter,
} from "../HtmlPermissionManagerDialog"

vi.mock("react-i18next", () => {
	const t = (key: string) => key
	const i18n = { language: "zh_CN" }
	return { useTranslation: () => ({ t, i18n }) }
})

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: { success: vi.fn(), error: vi.fn() },
}))

const activeGrant = {
	mode: "manifest" as const,
	userKey: "user-1",
	projectId: "project-1",
	appRootDir: "apps/demo/",
	entryPath: "apps/demo/index.html",
	appFingerprint: "fingerprint",
	scope: "llm.use" as const,
	grantedAt: Date.now() - 60_000,
	expiresAt: Date.now() + 15 * 60_000,
}

function createSnapshot(active = true): HtmlPermissionSnapshot {
	return {
		configStatus: "loaded",
		mode: "manifest",
		app: {
			name: "Demo App",
			version: "1.0.0",
			entry: "index.html",
			appRootDir: "apps/demo/",
			reason: "Analyze content",
		},
		permissions: [
			{
				scope: "llm.use",
				supported: true,
				declarationStatus: "declared",
				grant: active ? activeGrant : undefined,
			},
			{
				scope: "project.message.write",
				supported: true,
				declarationStatus: "notDeclared",
			},
			{
				scope: "future.scope",
				supported: false,
				declarationStatus: "unsupported",
			},
		],
		diagnostics: [{ code: "scopeUnsupported", scope: "future.scope" }],
		activeGrantCount: active ? 1 : 0,
	}
}

describe("HtmlPermissionManagerDialog", () => {
	it("normalizes underscore locale tags before formatting dates", () => {
		expect(() => createHtmlPermissionDateFormatter("zh_CN").format(Date.now())).not.toThrow()
	})

	it("renders app metadata, declarations, grants, and diagnostics", async () => {
		render(
			<HtmlPermissionManagerDialog
				open
				onOpenChange={vi.fn()}
				permissionRevision={0}
				getPermissionSnapshot={vi.fn().mockResolvedValue(createSnapshot())}
				onRevoke={vi.fn().mockResolvedValue(createSnapshot(false))}
				onRevokeAll={vi.fn().mockResolvedValue(createSnapshot(false))}
			/>,
		)

		expect(await screen.findByText("Demo App")).toBeInTheDocument()
		expect(
			screen.getByText("htmlEditor.permissionAuthorizationConfirm.scopes.llmUse"),
		).toBeInTheDocument()
		expect(screen.getByText("future.scope")).toBeInTheDocument()
		expect(
			screen.getByText("htmlEditor.permissionManager.diagnostics.scopeUnsupported"),
		).toBeInTheDocument()
		expect(screen.queryByText("project.message.write")).not.toBeInTheDocument()
		const dialog = screen.getByTestId("html-permission-manager-dialog")
		expect(dialog.className).toContain("w-[min(880px,calc(100vw-2rem))]")
		expect(dialog.className).toContain("h-[min(800px,90dvh)]")
		expect(dialog.className).toContain("grid-rows-[auto_minmax(0,1fr)_auto]")
		expect(screen.getByTestId("html-permission-manager-scroll-area").className).toContain(
			"scroll-area-thumb",
		)
		expect(screen.getByTestId("html-permission-manager-footer").className).toContain("shrink-0")
		expect(screen.getByTestId("html-permission-manager-revoke-note")).toBeInTheDocument()
	})

	it("revokes an active grant and refreshes the row immediately", async () => {
		const onRevoke = vi.fn().mockResolvedValue(createSnapshot(false))
		render(
			<HtmlPermissionManagerDialog
				open
				onOpenChange={vi.fn()}
				permissionRevision={0}
				getPermissionSnapshot={vi.fn().mockResolvedValue(createSnapshot())}
				onRevoke={onRevoke}
				onRevokeAll={vi.fn().mockResolvedValue(createSnapshot(false))}
			/>,
		)

		fireEvent.click(
			await screen.findByRole("button", { name: "htmlEditor.permissionManager.revoke" }),
		)

		await waitFor(() => expect(onRevoke).toHaveBeenCalledWith("llm.use"))
		expect(screen.getByText("htmlEditor.permissionManager.askWhenUsed")).toBeInTheDocument()
	})
})
