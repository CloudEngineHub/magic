import { afterEach, describe, expect, it, vi } from "vitest"
import { createPptxStreamingExporter, getPptxExportDiagnostic, type PptxDestination } from "../src"
import type { SandboxInstance } from "../src/sandbox"

/**
 * Browser engines expose different subsets of the File System Access/OPFS
 * surface. This matrix deliberately models the capability boundary rather
 * than relying on UA sniffing: every unsupported profile must produce the same
 * structured `opfs-unavailable` diagnostic and never a buffered fallback.
 */

const unsupportedProfiles = [
	{
		name: "Firefox (OPFS unavailable)",
		userAgent: "Mozilla/5.0 Firefox/147.0",
		storage: {},
	},
	{
		name: "Safari (OPFS unavailable)",
		userAgent: "Mozilla/5.0 Version/18.6 Safari/605.1.15",
		storage: {},
	},
	{
		name: "Safari private/restricted context",
		userAgent: "Mozilla/5.0 Version/18.6 Safari/605.1.15",
		storage: {
			getDirectory: vi.fn(() => {
				throw Object.assign(new Error("OPFS access denied"), { name: "NotAllowedError" })
			}),
		},
		expectedDetails: {
			capability: "opfs-staging",
			causeName: "NotAllowedError",
			reason: "runtime-operation-rejected",
		},
	},
] as const

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe("unsupported browser capability matrix", () => {
	it.each(unsupportedProfiles)(
		"$name returns a stable unavailable diagnostic",
		async ({ userAgent, storage, expectedDetails }) => {
			vi.stubGlobal("navigator", { userAgent, storage })
			const exporter = createPptxStreamingExporter({
				createSandbox: createSandboxStub,
				pipeline: {
					// The capability check must run before a Worker is created. Injecting
					// the packager isolates this test from the host test runner's Worker.
					createStreamingPresentationPackager: vi.fn(),
				},
			})

			const error = await exporter(["page"], {
				destination: createDestination(),
				stagingPolicy: { mode: "opfs" },
			}).promise.catch((value) => value)
			const diagnostic = getPptxExportDiagnostic(error)

			expect(error).toMatchObject({
				name: "PptxExportError",
				code: "opfs-unavailable",
			})
			const expectedDiagnosticDetails = expectedDetails
				? expect.objectContaining(expectedDetails)
				: expect.objectContaining({
						issues: expect.arrayContaining([
							expect.objectContaining({
								code: "opfs-unavailable",
								details: expect.objectContaining({
									capability: "opfs-staging",
									detection: "navigator.storage.getDirectory",
								}),
							}),
						]),
					})
			expect(diagnostic).toMatchObject({
				phase: "preflight",
				code: "opfs-unavailable",
				cancelled: false,
				details: expectedDiagnosticDetails,
			})
			expect(JSON.stringify(diagnostic)).not.toContain(userAgent)
		},
	)
})

function createSandboxStub(): SandboxInstance {
	return {
		iframe: {} as HTMLIFrameElement,
		window: {} as Window,
		document: {} as Document,
		render: vi.fn(),
		destroy: vi.fn(),
	}
}

function createDestination(): PptxDestination {
	return {
		kind: "sink-proxy",
		sink: { write: vi.fn(), close: vi.fn(), abort: vi.fn() },
	}
}
