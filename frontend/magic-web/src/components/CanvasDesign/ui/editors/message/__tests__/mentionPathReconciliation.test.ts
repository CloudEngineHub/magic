import { describe, expect, it } from "vitest"
import { reconcileMentionPathsWithPersistedReferences } from "../mentionPathReconciliation"

function resolveDesignAAbsolutePath(path: string): string {
	const normalized = path.replace(/\\/g, "/")
	if (normalized.startsWith("./")) {
		return `/画布A/${normalized.replace(/^\.\/+/, "")}`
	}
	if (normalized.startsWith("/")) return normalized
	if (normalized.startsWith("画布A/") || normalized.startsWith("画布B/")) {
		return `/${normalized}`
	}
	return normalized
}

describe("reconcileMentionPathsWithPersistedReferences", () => {
	it("preserves a workspace-root reference when sync resolves the same filename to canvas-relative", () => {
		expect(
			reconcileMentionPathsWithPersistedReferences({
				incomingPaths: ["./images/x.png"],
				persistedPaths: ["/images/x.png"],
				source: "sync",
				resolveAbsolutePath: resolveDesignAAbsolutePath,
			}),
		).toEqual(["/images/x.png"])
	})

	it("preserves a canvas-relative reference when sync resolves the same filename to workspace-root", () => {
		expect(
			reconcileMentionPathsWithPersistedReferences({
				incomingPaths: ["/images/x.png"],
				persistedPaths: ["./images/x.png"],
				source: "sync",
				resolveAbsolutePath: resolveDesignAAbsolutePath,
			}),
		).toEqual(["./images/x.png"])
	})

	it("keeps same-name persisted resources distinct and ordered", () => {
		expect(
			reconcileMentionPathsWithPersistedReferences({
				incomingPaths: ["./images/x.png", "/images/x.png"],
				persistedPaths: ["/images/x.png", "./images/x.png"],
				source: "sync",
				resolveAbsolutePath: resolveDesignAAbsolutePath,
			}),
		).toEqual(["/images/x.png", "./images/x.png"])
	})

	it("preserves the stored representation for host-equivalent paths", () => {
		expect(
			reconcileMentionPathsWithPersistedReferences({
				incomingPaths: ["./images/x.png"],
				persistedPaths: ["/画布A/images/x.png"],
				source: "sync",
				resolveAbsolutePath: resolveDesignAAbsolutePath,
			}),
		).toEqual(["/画布A/images/x.png"])
	})

	it("leaves filenames without a persisted match unchanged", () => {
		expect(
			reconcileMentionPathsWithPersistedReferences({
				incomingPaths: ["./images/a.png", "/images/b.png"],
				persistedPaths: ["/images/x.png"],
				source: "sync",
				resolveAbsolutePath: resolveDesignAAbsolutePath,
			}),
		).toEqual(["./images/a.png", "/images/b.png"])
	})

	it("allows user-originated changes to switch same-name resources", () => {
		expect(
			reconcileMentionPathsWithPersistedReferences({
				incomingPaths: ["./images/x.png"],
				persistedPaths: ["/images/x.png"],
				source: "user",
				resolveAbsolutePath: resolveDesignAAbsolutePath,
			}),
		).toEqual(["./images/x.png"])
	})
})
