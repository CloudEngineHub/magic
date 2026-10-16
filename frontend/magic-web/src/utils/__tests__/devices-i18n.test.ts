import { createInstance, type BackendModule, type ReadCallback } from "i18next"
import { afterEach, describe, expect, it, vi } from "vitest"
import zhCN from "@/assets/locales/zh_CN/login.json"
import enUS from "@/assets/locales/en_US/login.json"
import { getDeviceInfo } from "../devices"

vi.mock("@/enhance/magicElectron", () => ({ magic: undefined }))
vi.mock("@/platform/native", () => ({ getNativePort: vi.fn() }))
vi.mock("@/utils/crypto", () => ({ default: { MD5encryption: () => "device-id" } }))
vi.mock("ua-parser-js", () => ({
	default: class {
		getResult() {
			return {
				device: { type: "mobile" },
				browser: { name: "Test Browser", version: "1" },
				os: { name: "Test OS", version: "1" },
			}
		}
	},
}))

const originalNavigator = globalThis.navigator

function setUserAgent(userAgent: string) {
	vi.stubGlobal("navigator", { userAgent })
}

afterEach(() => {
	vi.stubGlobal("navigator", originalNavigator)
})

describe("getDeviceInfo translations", () => {
	it.each([
		{ language: "zh_CN", messages: zhCN },
		{ language: "en_US", messages: enUS },
	])(
		"uses login labels independently of the default namespace in $language",
		async ({ language, messages }) => {
			const i18n = createInstance()
			await i18n.init({
				lng: language,
				fallbackLng: false,
				defaultNS: "common",
				ns: ["common"],
				resources: {
					[language]: {
						common: { device: { app: "wrong", dingTalk: "wrong", unknown: "wrong" } },
						interface: { device: { dingTalk: "wrong" } },
						login: messages,
					},
				},
			})

			for (const [userAgent, name] of [
				["DingTalk", messages.device.dingTalk],
				["DingTalkAvoid", messages.device.dingTalk],
				["TeamshareWebAPP", `Teamshare {${messages.device.app}}`],
				["UnknownMobile", messages.device.unknown],
			]) {
				setUserAgent(userAgent)
				await expect(getDeviceInfo(i18n)).resolves.toMatchObject({ id: "device-id", name })
			}
		},
	)

	it("waits for initialization and the asynchronously loaded login namespace", async () => {
		setUserAgent("DingTalk")
		const reads = new Map<string, ReadCallback[]>()
		const backend: BackendModule = {
			type: "backend",
			init() {
				return undefined
			},
			read(_language, namespace, callback) {
				const callbacks = reads.get(namespace) ?? []
				callbacks.push(callback)
				reads.set(namespace, callbacks)
			},
		}
		const i18n = createInstance().use(backend)
		const initialized = i18n.init({
			lng: "zh_CN",
			fallbackLng: false,
			defaultNS: "common",
			ns: ["common"],
			initImmediate: false,
		})
		const completed = vi.fn()
		const result = getDeviceInfo(i18n)
		void result.then(completed)

		expect(reads.has("login")).toBe(false)
		expect(completed).not.toHaveBeenCalled()
		reads.get("common")?.forEach((callback) => callback(null, {}))
		await initialized
		await vi.waitFor(() => expect(reads.has("login")).toBe(true))
		expect(completed).not.toHaveBeenCalled()

		reads.get("login")?.forEach((callback) => callback(null, zhCN))
		await expect(result).resolves.toMatchObject({ name: "钉钉" })
	})

	it("propagates namespace failures instead of returning untranslated device labels", async () => {
		const loadError = new Error("login resource unavailable")
		const backend: BackendModule = {
			type: "backend",
			init() {
				return undefined
			},
			read(_language, _namespace, callback) {
				callback(loadError, false)
			},
		}
		const i18n = createInstance().use(backend)
		await i18n.init({
			lng: "en_US",
			fallbackLng: false,
			defaultNS: "common",
			ns: ["common"],
			partialBundledLanguages: true,
			resources: { en_US: { common: {} } },
		})

		await expect(getDeviceInfo(i18n)).rejects.toEqual(expect.arrayContaining([loadError]))
	})
})
