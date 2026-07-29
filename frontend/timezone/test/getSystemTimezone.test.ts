import { getSupportedLocales, registerLocale, resolveLocaleLabel, setDefaultLocale } from "../src"

describe("i18n APIs", () => {
	it("returns built-in locales", () => {
		const locales = getSupportedLocales()
		expect(locales).toContain("en_US")
		expect(locales).toContain("zh_CN")
	})

	it("supports built-in locale switch and fallback behavior", () => {
		setDefaultLocale("zh_CN")
		expect(resolveLocaleLabel("Asia/Shanghai")).toBeTruthy()
		expect(resolveLocaleLabel("Europe/London")).toBeTruthy()

		setDefaultLocale("en_US")
		expect(resolveLocaleLabel("Asia/Shanghai", "en_US")).toMatch(/GMT|Shanghai|Asia\/Shanghai/)
	})

	it("throws for invalid locale registration and unknown default locale", () => {
		expect(() => registerLocale("", {})).toThrow(
			"locale and messages are required when registering locale",
		)
		expect(() => setDefaultLocale("fr_FR" as never)).toThrow("locale not found: fr_FR")
	})
})
