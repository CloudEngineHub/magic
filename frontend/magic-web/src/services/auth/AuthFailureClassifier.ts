import { BUSINESS_API_ERROR_CODE } from "@/constants/api"
import type { AuthFailureKind } from "./contracts"

/** Authentication business codes are numeric top-level response codes only. */
const AUTH_INVALID_CODES = new Set<number>([
	BUSINESS_API_ERROR_CODE.ACCOUNT_NO_PERMISSION,
	BUSINESS_API_ERROR_CODE.USER_TOKEN_EXPIRED,
	BUSINESS_API_ERROR_CODE.USER_NOT_EXIST,
])

export function isAuthInvalidCode(value: unknown): value is number {
	return typeof value === "number" && AUTH_INVALID_CODES.has(value)
}

export function getAuthFailureReason(code: unknown): AuthFailureKind | null {
	if (!isAuthInvalidCode(code)) return null

	return code === BUSINESS_API_ERROR_CODE.ACCOUNT_NO_PERMISSION
		? "account-unauthorized"
		: "token-expired"
}

export function getAuthFailureCodeSet(): ReadonlySet<number> {
	return AUTH_INVALID_CODES
}
