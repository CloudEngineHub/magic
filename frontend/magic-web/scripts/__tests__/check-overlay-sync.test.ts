import { createRequire } from "node:module"
import { describe, expect, it, vi } from "vitest"

const require = createRequire(import.meta.url)
const overlaySync =
	require("../git-hooks/check-overlay-sync.cjs") as typeof import("../git-hooks/check-overlay-sync.cjs")

describe("overlay synchronization check", () => {
	it("reports an enterprise change hidden by an existing customer override", () => {
		expect(
			overlaySync.findUnsyncedOverlayChanges({
				changedFiles: ["enterprise/src/App.tsx"],
				trackedCustomerFiles: ["customer/src/App.tsx"],
			}),
		).toEqual([
			{ enterpriseFile: "enterprise/src/App.tsx", customerFile: "customer/src/App.tsx" },
		])
	})

	it("passes when the matching customer file is staged too", () => {
		expect(
			overlaySync.findUnsyncedOverlayChanges({
				changedFiles: ["enterprise/src/App.tsx", "customer/src/App.tsx"],
				trackedCustomerFiles: ["customer/src/App.tsx"],
			}),
		).toEqual([])
	})

	it("passes when no customer override exists or when it is deleted", () => {
		expect(
			overlaySync.findUnsyncedOverlayChanges({
				changedFiles: ["enterprise/src/App.tsx"],
				trackedCustomerFiles: [],
			}),
		).toEqual([])
		expect(
			overlaySync.findUnsyncedOverlayChanges({
				changedFiles: ["enterprise/src/App.tsx", "customer/src/App.tsx"],
				trackedCustomerFiles: [],
			}),
		).toEqual([])
	})

	it("reads staged and tracked paths from git", () => {
		const spawnSyncRef = vi
			.fn()
			.mockReturnValueOnce({ status: 0, stdout: "enterprise/src/App.tsx\0" })
			.mockReturnValueOnce({ status: 0, stdout: "customer/src/App.tsx\0" })

		expect(
			overlaySync.checkOverlaySync({ cwd: "/repo/frontend/magic-web", spawnSyncRef }),
		).toMatchObject({
			ok: false,
			issues: [{ customerFile: "customer/src/App.tsx" }],
		})
		expect(spawnSyncRef).toHaveBeenCalledWith(
			"git",
			["diff", "--cached", "--name-only", "--diff-filter=ACMRD", "-z", "--relative", "--"],
			{ cwd: "/repo/frontend/magic-web", encoding: "utf8" },
		)
	})
})
