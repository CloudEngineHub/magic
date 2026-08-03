import { afterEach, describe, expect, it } from "vitest"
import {
	PPTX_EXPORT_FLAGS_STORAGE_KEY,
	resolvePptxExportFeatureFlags,
	resolvePptxExportStrategy,
	resolvePptxMediaPolicyMode,
} from "../pptxExportStrategy"

afterEach(() => {
	localStorage.removeItem(PPTX_EXPORT_FLAGS_STORAGE_KEY)
	Reflect.deleteProperty(globalThis, "__MAGIC_PPTX_EXPORT_FLAGS__")
})

describe("PPTX export strategy", () => {
	it("uses direct-stream for stable sources and rolling-stage for signed URLs", () => {
		expect(resolvePptxMediaPolicyMode({ mediaSource: "stable-url" })).toBe("direct-stream")
		expect(resolvePptxMediaPolicyMode({ mediaSource: "signed-url" })).toBe("rolling-stage")
		expect(
			resolvePptxMediaPolicyMode({
				requested: "full-stage",
				mediaSource: "stable-url",
			}),
		).toBe("full-stage")
	})

	it("uses the legacy route only for a safe small export", () => {
		expect(
			resolvePptxExportStrategy({ pageCount: 20, fileStreamingAvailable: false }),
		).toMatchObject({
			route: "legacy",
			isLargeExport: false,
			legacyFallbackAllowed: true,
		})
	})

	it("returns a structured unavailable reason instead of buffering a large export", () => {
		expect(
			resolvePptxExportStrategy({ pageCount: 300, fileStreamingAvailable: false }),
		).toMatchObject({
			route: "unavailable",
			reasonCode: "file-stream-unavailable",
			isLargeExport: true,
			legacyFallbackAllowed: false,
		})
	})

	it("blocks a ZIP64 candidate when the independent ZIP64 flag is disabled", () => {
		expect(
			resolvePptxExportStrategy({
				estimatedBytes: BigInt(5) * BigInt(1024) ** BigInt(3),
				fileStreamingAvailable: true,
				flags: { zip64: false },
			}),
		).toMatchObject({
			route: "unavailable",
			reasonCode: "zip64-disabled",
			requiresZip64: true,
		})
	})

	it("does not let forceLegacy send a large export through the memory path", () => {
		expect(
			resolvePptxExportStrategy({
				pageCount: 300,
				fileStreamingAvailable: true,
				flags: { forceLegacy: true },
			}),
		).toMatchObject({ route: "unavailable", reasonCode: "legacy-not-safe" })
	})

	it("merges stored and runtime flags with explicit overrides taking precedence", () => {
		localStorage.setItem(
			PPTX_EXPORT_FLAGS_STORAGE_KEY,
			JSON.stringify({ streamingOutputSink: false, zip64: false }),
		)
		Object.defineProperty(globalThis, "__MAGIC_PPTX_EXPORT_FLAGS__", {
			configurable: true,
			value: { streamingOutputSink: true, forceLegacy: true },
		})

		expect(resolvePptxExportFeatureFlags({ forceLegacy: false })).toMatchObject({
			streamingOutputSink: true,
			zip64: false,
			forceLegacy: false,
		})
	})
})
