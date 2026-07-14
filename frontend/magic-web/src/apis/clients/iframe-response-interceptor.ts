import type { InterceptorContext } from "../core/HttpClient"

const BUSINESS_SUCCESS_CODE = 1000

function getErrorMessage(data: unknown, fallback: string): string {
	if (!data || typeof data !== "object") return fallback
	const record = data as Record<string, unknown>
	return (
		(typeof record.message === "string" && record.message) ||
		(typeof record.error === "string" && record.error) ||
		fallback
	)
}

function createRequestError(message: string, data?: unknown): Error {
	const error = new Error(message)
	if (data !== undefined) {
		;(error as Error & { response?: unknown }).response = data
	}
	return error
}

export async function iframeBusinessErrorInterceptor({
	request,
	response,
	http,
}: InterceptorContext): Promise<InterceptorContext> {
	if (response.status < 200 || response.status >= 300) {
		throw createRequestError(
			getErrorMessage(response.data, response.statusText || `HTTP ${response.status}`),
			response.data,
		)
	}

	const data = response.data
	if (data && typeof data === "object" && "code" in data) {
		const code = (data as Record<string, unknown>).code
		if (code !== BUSINESS_SUCCESS_CODE) {
			throw createRequestError(
				getErrorMessage(data, `Request failed with code ${String(code)}`),
				data,
			)
		}
	}

	return { request, response, http }
}
