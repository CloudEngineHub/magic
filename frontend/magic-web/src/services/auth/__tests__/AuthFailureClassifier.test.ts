import { describe, expect, it } from "vitest"
import { BUSINESS_API_ERROR_CODE } from "@/constants/api"
import { getAuthFailureReason, isAuthInvalidCode } from "../AuthFailureClassifier"

describe("AuthFailureClassifier", () => {
	it("accepts only supported numeric top-level authentication codes", () => {
		expect(isAuthInvalidCode(BUSINESS_API_ERROR_CODE.ACCOUNT_NO_PERMISSION)).toBe(true)
		expect(isAuthInvalidCode(BUSINESS_API_ERROR_CODE.USER_TOKEN_EXPIRED)).toBe(true)
		expect(isAuthInvalidCode(BUSINESS_API_ERROR_CODE.USER_NOT_EXIST)).toBe(true)
		expect(isAuthInvalidCode(String(BUSINESS_API_ERROR_CODE.USER_TOKEN_EXPIRED))).toBe(false)
		expect(isAuthInvalidCode({ code: BUSINESS_API_ERROR_CODE.USER_TOKEN_EXPIRED })).toBe(false)
	})

	it("maps supported codes to the shared auth failure vocabulary", () => {
		expect(getAuthFailureReason(BUSINESS_API_ERROR_CODE.ACCOUNT_NO_PERMISSION)).toBe(
			"account-unauthorized",
		)
		expect(getAuthFailureReason(BUSINESS_API_ERROR_CODE.USER_TOKEN_EXPIRED)).toBe(
			"token-expired",
		)
		expect(getAuthFailureReason(BUSINESS_API_ERROR_CODE.USER_NOT_EXIST)).toBe("token-expired")
		expect(getAuthFailureReason(200)).toBeNull()
	})
})
