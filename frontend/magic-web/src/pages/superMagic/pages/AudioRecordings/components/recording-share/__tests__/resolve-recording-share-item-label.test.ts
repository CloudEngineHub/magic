import i18next from "i18next"
import { beforeAll, describe, expect, it } from "vitest"
import zhAudioRecordings from "@/assets/locales/zh_CN/audioRecordings.json"
import type { RecordingShareGroupedItem } from "../../utils/build-recording-share-selection"
import {
	resolveRecordingShareItemLabel,
	resolveRecordingShareSummaryRootLabel,
} from "../resolve-recording-share-item-label"

const mockAudioItem: RecordingShareGroupedItem = {
	groupKey: "audio",
	fileId: "file-audio",
	file: { file_id: "file-audio", file_name: "session.wav" },
}

describe("resolveRecordingShareItemLabel", () => {
	beforeAll(async () => {
		await i18next.init({
			lng: "zh_CN",
			fallbackLng: "zh_CN",
			ns: ["audioRecordings"],
			defaultNS: "audioRecordings",
			resources: {
				zh_CN: {
					audioRecordings: zhAudioRecordings,
				},
			},
		})
	})

	it("resolves share picker labels from dedicated share.items keys", () => {
		expect(resolveRecordingShareItemLabel(mockAudioItem)).toBe("录音")
		expect(resolveRecordingShareSummaryRootLabel()).toBe("总结")
	})
})
