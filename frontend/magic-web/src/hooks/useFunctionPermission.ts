import { useCallback, useEffect, useState } from "react"
import { reaction } from "mobx"
import { FunctionPermissionApi } from "@/apis"
import {
	PLATFORM_SUPER_ADMIN_PERMISSION_KEY,
	type FunctionPermissionCode,
	type FunctionPermissionMap,
} from "@/apis"
import { userStore } from "@/models/user"

type FunctionPermissionState = {
	data?: FunctionPermissionMap
	error?: unknown
	isLoading: boolean
}

type PlatformSuperAdminState = {
	isSuperAdmin: boolean
	error?: unknown
	isLoading: boolean
}

const listeners = new Set<() => void>()

let permissionCache: FunctionPermissionMap | undefined
let permissionError: unknown
let permissionRequest: Promise<FunctionPermissionMap> | null = null
let hasRequestedPermission = false
let requestVersion = 0
let permissionContextKey = ""
let disposePermissionContextReaction: (() => void) | undefined

const getCurrentUserId = () => userStore.user.userInfo?.user_id ?? ""
const getPermissionContextKey = () =>
	`${getCurrentUserId()}:${userStore.user.organizationCode ?? ""}`

const notifyListeners = () => {
	listeners.forEach((listener) => listener())
}

const getPermissionState = (): FunctionPermissionState => ({
	data: permissionContextKey === getPermissionContextKey() ? permissionCache : undefined,
	error: permissionContextKey === getPermissionContextKey() ? permissionError : undefined,
	isLoading:
		permissionContextKey !== getPermissionContextKey() ||
		permissionRequest != null ||
		!hasRequestedPermission,
})

const resetFunctionPermissions = (contextKey = getPermissionContextKey()) => {
	permissionCache = undefined
	permissionError = undefined
	permissionRequest = null
	hasRequestedPermission = false
	permissionContextKey = contextKey
	requestVersion += 1
	notifyListeners()
}

const fetchFunctionPermissions = (force = false) => {
	const currentContextKey = getPermissionContextKey()
	if (permissionContextKey !== currentContextKey) {
		resetFunctionPermissions(currentContextKey)
	}

	if (permissionRequest && !force) return permissionRequest
	if (!force && permissionCache) return Promise.resolve(permissionCache)

	hasRequestedPermission = true
	permissionError = undefined
	const currentRequestVersion = requestVersion + 1
	requestVersion = currentRequestVersion
	const request = FunctionPermissionApi.getMe()
		.then((permissions) => {
			if (currentRequestVersion === requestVersion) {
				permissionCache = permissions
			}
			return permissions
		})
		.catch((error: unknown) => {
			if (currentRequestVersion === requestVersion) {
				permissionError = error
			}
			throw error
		})
		.finally(() => {
			if (currentRequestVersion === requestVersion) {
				permissionRequest = null
				notifyListeners()
			}
		})

	permissionRequest = request
	notifyListeners()
	return request
}

const startPermissionContextReaction = () => {
	if (disposePermissionContextReaction) return

	disposePermissionContextReaction = reaction(
		getPermissionContextKey,
		(contextKey, previousContextKey) => {
			if (contextKey === previousContextKey) return
			resetFunctionPermissions(contextKey)
			void fetchFunctionPermissions().catch(() => undefined)
		},
	)
}

const stopPermissionContextReaction = () => {
	if (listeners.size > 0) return

	disposePermissionContextReaction?.()
	disposePermissionContextReaction = undefined
}

const platformPermissionListeners = new Set<() => void>()

let platformPermissionCache: boolean | undefined
let platformPermissionError: unknown
let platformPermissionRequest: Promise<boolean> | null = null
let hasRequestedPlatformPermission = false
let platformPermissionContextKey = ""
let platformPermissionRequestVersion = 0
let disposePlatformPermissionReaction: (() => void) | undefined

const notifyPlatformPermissionListeners = () => {
	platformPermissionListeners.forEach((listener) => listener())
}

const getPlatformSuperAdminState = (): PlatformSuperAdminState => {
	const contextKey = getPermissionContextKey()

	return {
		isSuperAdmin:
			platformPermissionContextKey === contextKey && platformPermissionCache === true,
		error: platformPermissionContextKey === contextKey ? platformPermissionError : undefined,
		isLoading:
			platformPermissionContextKey !== contextKey ||
			platformPermissionRequest != null ||
			!hasRequestedPlatformPermission,
	}
}

const resetPlatformPermission = (contextKey = getPermissionContextKey()) => {
	platformPermissionCache = undefined
	platformPermissionError = undefined
	platformPermissionRequest = null
	hasRequestedPlatformPermission = false
	platformPermissionContextKey = contextKey
	platformPermissionRequestVersion += 1
	notifyPlatformPermissionListeners()
}

const fetchPlatformSuperAdmin = (force = false) => {
	const contextKey = getPermissionContextKey()
	if (platformPermissionContextKey !== contextKey) {
		resetPlatformPermission(contextKey)
	}

	if (platformPermissionRequest && !force) return platformPermissionRequest
	if (!force && platformPermissionCache !== undefined) {
		return Promise.resolve(platformPermissionCache)
	}

	hasRequestedPlatformPermission = true
	platformPermissionError = undefined
	const currentRequestVersion = platformPermissionRequestVersion + 1
	platformPermissionRequestVersion = currentRequestVersion
	const request = FunctionPermissionApi.getPermissionGroups()
		.then(({ permission_key }) => {
			const isSuperAdmin =
				permission_key?.includes(PLATFORM_SUPER_ADMIN_PERMISSION_KEY) === true
			if (currentRequestVersion === platformPermissionRequestVersion) {
				platformPermissionCache = isSuperAdmin
			}
			return isSuperAdmin
		})
		.catch((error: unknown) => {
			if (currentRequestVersion === platformPermissionRequestVersion) {
				platformPermissionError = error
			}
			throw error
		})
		.finally(() => {
			if (currentRequestVersion === platformPermissionRequestVersion) {
				platformPermissionRequest = null
				notifyPlatformPermissionListeners()
			}
		})

	platformPermissionRequest = request
	notifyPlatformPermissionListeners()
	return request
}

const startPlatformPermissionReaction = () => {
	if (disposePlatformPermissionReaction) return

	disposePlatformPermissionReaction = reaction(
		getPermissionContextKey,
		(contextKey, previous) => {
			if (contextKey === previous) return
			resetPlatformPermission(contextKey)
			void fetchPlatformSuperAdmin().catch(() => undefined)
		},
	)
}

const stopPlatformPermissionReaction = () => {
	if (platformPermissionListeners.size > 0) return

	disposePlatformPermissionReaction?.()
	disposePlatformPermissionReaction = undefined
}

const usePlatformSuperAdmin = (enabled: boolean) => {
	const [state, setState] = useState<PlatformSuperAdminState>(getPlatformSuperAdminState)

	useEffect(() => {
		if (!enabled) return

		const handleStateChange = () => setState(getPlatformSuperAdminState())
		platformPermissionListeners.add(handleStateChange)
		startPlatformPermissionReaction()
		handleStateChange()
		void fetchPlatformSuperAdmin().catch(() => undefined)

		return () => {
			platformPermissionListeners.delete(handleStateChange)
			stopPlatformPermissionReaction()
		}
	}, [enabled])

	return enabled ? state : { isSuperAdmin: false, isLoading: false, error: undefined }
}

export const useFunctionPermissions = () => {
	const [state, setState] = useState<FunctionPermissionState>(getPermissionState)

	useEffect(() => {
		const handleStateChange = () => setState(getPermissionState())

		listeners.add(handleStateChange)
		startPermissionContextReaction()
		void fetchFunctionPermissions().catch(() => undefined)

		return () => {
			listeners.delete(handleStateChange)
			stopPermissionContextReaction()
		}
	}, [])

	const mutate = useCallback(() => fetchFunctionPermissions(true), [])

	return {
		...state,
		mutate,
	}
}

export interface UseFunctionPermissionOptions {
	/** Allow platform super administrators to bypass a missing function permission. */
	allowSuperAdmin?: boolean
}

export const useFunctionPermission = (
	code: FunctionPermissionCode,
	options: UseFunctionPermissionOptions = {},
) => {
	const { data, error, isLoading, mutate } = useFunctionPermissions()
	const directPermissionGranted = data?.[code] === true
	const shouldCheckSuperAdmin =
		options.allowSuperAdmin === true && !isLoading && !directPermissionGranted
	const platformSuperAdmin = usePlatformSuperAdmin(shouldCheckSuperAdmin)
	const refresh = useCallback(async () => {
		const permissions = await mutate()
		if (options.allowSuperAdmin === true && permissions?.[code] !== true) {
			await fetchPlatformSuperAdmin(true)
		}
		return permissions
	}, [code, mutate, options.allowSuperAdmin])

	return {
		error: error ?? platformSuperAdmin.error,
		isAllowed: directPermissionGranted || platformSuperAdmin.isSuperAdmin,
		isLoading: isLoading || platformSuperAdmin.isLoading,
		mutate: refresh,
		permissions: data,
	}
}
