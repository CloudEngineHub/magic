import { describe, expect, it } from "vitest"
import { LoginValueKey, LOGIN_STRATEGY_QUERY_KEY } from "../../constants"
import { buildLoginRedirectSearchParams } from "../loginRedirect"

describe("buildLoginRedirectSearchParams", () => {
	it("preserves login strategy from the current URL", () => {
		const params = buildLoginRedirectSearchParams({
			currentHref:
				"https://www.letsmagic.cn/default/super/assistant?login-strategy=phone_password",
		})

		expect(params.get(LoginValueKey.REDIRECT_URL)).toBe(
			"https://www.letsmagic.cn/default/super/assistant?login-strategy=phone_password",
		)
		expect(params.get(LOGIN_STRATEGY_QUERY_KEY)).toBe("phone_password")
	})

	it("preserves login strategy from an existing redirect target", () => {
		const redirectTarget =
			"https://www.letsmagic.cn/default/super/assistant?login-strategy=email"

		const params = buildLoginRedirectSearchParams({
			currentHref: `https://www.letsmagic.cn/login?redirect=${encodeURIComponent(
				redirectTarget,
			)}`,
			redirectTarget,
		})

		expect(params.get(LoginValueKey.REDIRECT_URL)).toBe(redirectTarget)
		expect(params.get(LOGIN_STRATEGY_QUERY_KEY)).toBe("email")
	})

	it("preserves the complete file share URL for redirecting after login", () => {
		const shareUrl = "https://magic.example.com/share/files/943197067324579840?password=MFHLL2"

		const params = buildLoginRedirectSearchParams({
			currentHref: shareUrl,
			redirectTarget: shareUrl,
		})

		expect(params.get(LoginValueKey.REDIRECT_URL)).toBe(shareUrl)
	})
})
