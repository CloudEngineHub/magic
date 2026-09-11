import { describe, expect, it, vi } from "vitest"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { openMicroAppTab } from "../openMicroAppTab"

vi.mock("@/utils/pubsub", () => ({
	default: {
		publish: vi.fn(),
	},
	PubSubEvents: {
		Switch_Detail_Mode: "super_magic_switch_detail_mode",
		Open_Micro_App_Tab: "super_magic_open_micro_app_tab",
	},
}))

describe("openMicroAppTab", () => {
	it("switches to files view and opens a micro-app tab", () => {
		expect(openMicroAppTab({ appId: "app-1", appName: "内购" })).toBe("app-1")
		expect(pubsub.publish).toHaveBeenCalledWith(PubSubEvents.Switch_Detail_Mode, "files")
		expect(pubsub.publish).toHaveBeenCalledWith(PubSubEvents.Open_Micro_App_Tab, {
			appId: "app-1",
			appName: "内购",
		})
	})

	it("ignores empty app ids", () => {
		vi.mocked(pubsub.publish).mockClear()
		expect(openMicroAppTab({ appId: "  " })).toBeNull()
		expect(pubsub.publish).not.toHaveBeenCalled()
	})
})
