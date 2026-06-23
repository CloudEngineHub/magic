import { describe, expect, it } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import {
	buildShareRecordingCapabilities,
	buildShareRecordingMagicProjectConfig,
	isAudioProjectMode,
	shouldRenderAudioRecordingShareShell,
} from "../share-recording-detail"

/** Creates a fictional attachment row so tests never rely on real recording resource values. */
function createAttachment(overrides: Partial<AttachmentItem> = {}): AttachmentItem {
	return {
		file_id: "file-mock-001",
		file_name: "mock.md",
		file_extension: "md",
		file_key: "workspace/mock.md",
		file_size: 128,
		relative_file_path: "/bundle/mock.md",
		file_url: "https://example.test/mock.md",
		is_hidden: false,
		updated_at: "2026-06-23 10:00:00",
		is_directory: false,
		sort: 0,
		parent_id: "dir-mock-001",
		source: 3,
		...overrides,
	}
}

describe("share recording detail helpers", () => {
	it("recognizes audio project mode and requires attachments before rendering the audio share shell", () => {
		expect(
			shouldRenderAudioRecordingShareShell({
				projectMode: "audio",
				attachments: { tree: [createAttachment()], list: [createAttachment()] },
			}),
		).toBe(true)
		expect(
			shouldRenderAudioRecordingShareShell({
				projectMode: "audio",
				attachments: { tree: [], list: [] },
			}),
		).toBe(false)
		expect(isAudioProjectMode("audio")).toBe(true)
		expect(isAudioProjectMode("chat")).toBe(false)
	})

	it("uses parsed magic.project.js metadata before falling back to audio directory display_config metadata", () => {
		const parsedConfig = buildShareRecordingMagicProjectConfig({
			magicProjectConfig: {
				name: "Parsed title",
				metadata: {
					title: "Parsed title",
					duration: 88,
					speakers: {
						"Speaker-1": "Host",
					},
				},
			},
			audioDisplayConfig: {
				name: "Fallback title",
				metadata: {
					title: "Fallback title",
					duration: 41,
					speakers: {
						"Speaker-1": "Fallback speaker",
					},
				},
			},
		})

		expect(parsedConfig?.metadata?.title).toBe("Parsed title")
		expect(parsedConfig?.metadata?.duration).toBe(88)
		expect(parsedConfig?.metadata?.speakers?.["Speaker-1"]).toBe("Host")
	})

	it("falls back to audio directory display_config metadata when magic.project.js is missing", () => {
		const fallbackConfig = buildShareRecordingMagicProjectConfig({
			magicProjectConfig: null,
			audioDisplayConfig: {
				name: "Fallback title",
				metadata: {
					title: "Fallback title",
					duration: 41,
					speakers: {
						"Speaker-1": "Fallback speaker",
					},
				},
				files: {
					audio: "mock.wav",
				},
			},
		})

		expect(fallbackConfig?.metadata?.title).toBe("Fallback title")
		expect(fallbackConfig?.metadata?.duration).toBe(41)
		expect(fallbackConfig?.files?.audio).toBe("mock.wav")
	})

	it("builds read-only share capabilities and only opens export when download permission is granted", () => {
		expect(buildShareRecordingCapabilities(true)).toMatchObject({
			viewMode: "share",
			canRename: false,
			canDelete: false,
			canMoveGroup: false,
			canGenerateSummary: false,
			canManageShare: false,
			canEditSpeakers: false,
			canExport: true,
		})
		expect(buildShareRecordingCapabilities(false).canExport).toBe(false)
	})
})
