import type { UserService } from "@/services/user/UserService"
import { userStore } from "@/models/user/stores"
import type { Container } from "@/services/ServiceContainer"
import { RoutePath } from "@/constants/routes"
import type { InterceptorContext } from "../../core/HttpClient"
import { LoginValueKey } from "@/pages/login/constants"
import { buildLoginRedirectSearchParams } from "@/pages/login/utils/loginRedirect"
import { UrlUtils } from "@/apis/utils"
import { BUSINESS_API_ERROR_CODE } from "@/constants/api"
import magicToast from "@/components/base/MagicToaster/utils"
import { authSessionCoordinator } from "@/services/auth/AuthSessionCoordinator"
import { getAuthFailureReason, isAuthInvalidCode } from "@/services/auth/AuthFailureClassifier"

/** HTTP status code enum (RFC 7231, RFC 7233, and RFC 7540) */
const enum HttpStatusCode {
	/** 200 OK - Request succeeded */
	Ok = 200,
	/** 302 Found - Resource temporarily redirected */
	Found = 302,
	/** 400 Bad Request - Invalid request syntax */
	BadRequest = 400,
	/** 401 Unauthorized - Authentication required */
	Unauthorized = 401,
	/** 403 Forbidden - Access denied */
	Forbidden = 403,
	/** 404 Not Found - Resource does not exist */
	NotFound = 404,
	/** 500 Internal Server Error - Internal server error */
	InternalServerError = 500,
}

const enum BusinessResponseCode {
	/** Successful response */
	Success = 1000,
	/** Invalid organization */
	InvalidOrganization = 40101,
	/** No API platform permission */
	PlatformUnauthorized = 70007,
}

/**
 * Generates the login redirect URL.
 * @returns The login redirect URL
 */
export const genLoginRedirectUrl = () => {
	const redirectUrl = new URL(RoutePath.Login, window.location.origin)
	if (window.location.pathname !== RoutePath.Login) {
		const redirectTarget = new URLSearchParams(window.location.search).get(
			LoginValueKey.REDIRECT_URL,
		)

		// Keep login-related query state when API auth expires inside embedded routes.
		redirectUrl.search = buildLoginRedirectSearchParams({
			currentHref: window.location.href,
			redirectTarget: redirectTarget ?? window.location.href,
		}).toString()
	}
	return redirectUrl.toString()
}

/** Invalid login */
export function generateUnauthorizedResInterceptor(service: Container) {
	/** Classify the response and hand session cleanup/navigation to the auth coordinators. */
	async function handleUnauthorized(
		authorization: string | undefined | null,
		reason: "token-expired" | "account-unauthorized",
	) {
		const user = userStore.account.getAccountByAccessToken(authorization || "")
		await authSessionCoordinator.invalidate({
			service,
			accountId: user?.magic_id,
			reason,
			source: "http",
			returnTo: window.location.href,
		})
	}

	return async function unAuthorized({ request, response, http }: InterceptorContext) {
		const { enableAuthorizationVerification = true } = request

		if (
			(enableAuthorizationVerification && response.status === HttpStatusCode.Unauthorized) ||
			isAuthInvalidCode(response?.data?.code)
		) {
			const authorization = request.headers?.get("authorization")
			const user = userStore.account.getAccountByAccessToken(authorization || "")
			/** Correct the request domain and retry only when the cluster-code mapping is invalid. */
			if (user && request.authRetryAttempt !== 1) {
				const baseUrl = http.getBaseURL(user.deployCode)
				if (baseUrl) {
					// Return the retried API request.
					http.setBaseURL(UrlUtils.parse(baseUrl).origin)
					const res = await http.retry({
						...request,
						authRetryAttempt: 1,
						url: UrlUtils.replaceHostname(
							request.url as string,
							UrlUtils.parse(baseUrl).host,
						),
					})

					// Parse JSON data (only needs to be executed once)
					const jsonData = (
						await UrlUtils.responseParse(res.clone(), {
							parseJsonLargeIntAsString: request.parseJsonLargeIntAsString,
						})
					).data

					if (
						(enableAuthorizationVerification &&
							res.status === HttpStatusCode.Unauthorized) ||
						isAuthInvalidCode(jsonData?.code)
					) {
						const reason = getAuthFailureReason(jsonData?.code)
						await handleUnauthorized(
							authorization,
							reason === "account-unauthorized" ? reason : "token-expired",
						)
						throw new Error("Unauthorized")
					}

					return {
						http,
						request,
						response: {
							status: res.status,
							statusText: res.statusText,
							headers: res.headers,
							data: jsonData,
						},
					}
				}
			}
			const reason = getAuthFailureReason(response?.data?.code)
			await handleUnauthorized(
				authorization,
				reason === "account-unauthorized" ? reason : "token-expired",
			)
			throw new Error("Unauthorized")
		}
		return { http, request, response }
	}
}

/** Invalid organization */
export function generateInvalidOrgResInterceptor(service: Container) {
	return async function invalidOrg({ request, response, http }: InterceptorContext) {
		const jsonResponse = response.data
		if (jsonResponse?.code === BusinessResponseCode.InvalidOrganization) {
			service
				.get<UserService>("userService")
				.setMagicOrganizationCode(userStore.user.organizations?.[0]?.organization_code)
			window.location.reload()
		}
		return { http, request, response }
	}
}

/** No API platform permission */
export function generatePlatformUnauthorizedResInterceptor() {
	return async function invalidPlatform({ request, response, http }: InterceptorContext) {
		const jsonResponse = response.data
		if (jsonResponse?.code !== BusinessResponseCode.PlatformUnauthorized) {
			return { http, request, response }
		}

		if (request?.enableErrorMessagePrompt && jsonResponse?.message) {
			magicToast.error(jsonResponse.message)
		}

		throw jsonResponse
	}
}

/** Successful response */
export function generateSuccessResInterceptor() {
	return async function success({ request, response, http }: InterceptorContext) {
		const jsonResponse = response.data
		if (jsonResponse?.code !== BusinessResponseCode.Success) {
			if (request?.enableErrorMessagePrompt && jsonResponse?.message) {
				magicToast.error(jsonResponse.message)
			}
			throw jsonResponse
		}

		return { http, request, response }
	}
}
