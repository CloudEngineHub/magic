import { useDeepCompareEffect, useMemoizedFn, useMount } from "ahooks"
import { useRef } from "react"
import { useImmer } from "use-immer"
import type { ConfigService } from "@/services/config/ConfigService"
import {
	LoginDeployment,
	LOGIN_STRATEGY_QUERY_KEY,
	LoginValueKey,
	PRIVATE_DEPLOYMENT_LOGIN_STRATEGY,
	WIDGET_DEPLOYMENT_CODE_QUERY_KEY,
} from "@/pages/login/constants"
import { useClusterCode } from "@/providers/ClusterProvider"
import { configStore } from "@/models/config"
import type { ServiceContainer } from "@/services/ServiceContainer"

interface UseLoginClusterSessionParams {
	service: ServiceContainer
}

/** Reads a Widget query value from the login URL or its post-login redirect target. */
function getWidgetQueryValue(key: string) {
	if (typeof window === "undefined") return ""
	const loginUrl = new URL(window.location.href)
	const directValue = loginUrl.searchParams.get(key)?.trim()
	if (directValue) return directValue

	const redirectUrl = loginUrl.searchParams.get(LoginValueKey.REDIRECT_URL)
	if (!redirectUrl) return ""

	try {
		return new URL(redirectUrl, window.location.origin).searchParams.get(key)?.trim() ?? ""
	} catch {
		return ""
	}
}

/** Reads the Widget deployment code that should be prefilled before a private deployment is selected. */
function getWidgetDeploymentCode() {
	return getWidgetQueryValue(WIDGET_DEPLOYMENT_CODE_QUERY_KEY)
}

/** Checks whether the Widget explicitly requested the private deployment login form. */
function hasPrivateDeploymentLoginStrategy() {
	return getWidgetQueryValue(LOGIN_STRATEGY_QUERY_KEY) === PRIVATE_DEPLOYMENT_LOGIN_STRATEGY
}

export function useLoginClusterSession(params: UseLoginClusterSessionParams) {
	const { service } = params
	// 登录页当前会话使用的局部 cluster / Login-scoped cluster for the current login session.
	const { clusterCode, setClusterCode } = useClusterCode()
	// Keep the unconfirmed Widget value separate from clusterCode, which controls requests and account switching.
	const prefilledDeploymentCode = getWidgetDeploymentCode()
	const isPrivateDeploymentWidget = hasPrivateDeploymentLoginStrategy()
	// Clear a remembered deployment only once so a user-confirmed code can become the active cluster.
	const shouldClearCachedCluster = useRef(isPrivateDeploymentWidget)
	// 控制当前展示公网还是私有化登录 UI / Controls whether the current UI shows public or private login.
	const [deployment, setDeployment] = useImmer(LoginDeployment.PublicDeploymentLogin)

	const setPrivateClusterCode = useMemoizedFn((code: string) => {
		// 立即更新登录页局部 cluster，并持久化缓存私有码，
		// 方便后续恢复同一私有化登录入口 /
		// Update the login-scoped cluster immediately, then persist the cached
		// private cluster so the login page can restore the same private option later.
		setClusterCode(code)
		if (code) {
			service.get<ConfigService>("configService")?.setClusterCodeCache(code)
		}
	})

	useMount(() => {
		if (isPrivateDeploymentWidget) {
			// Keep the Widget code out of clusterCode until confirmation so it cannot change requests or caches.
			setDeployment(LoginDeployment.PrivateDeploymentLogin)
			return
		}

		// `clusterCodeCache` 表示记住的私有化登录偏好。
		// 它决定登录页初始展示，但不代表请求已经切到该私有化环境 /
		// `clusterCodeCache` is the remembered private login preference.
		// It decides the initial login UI, but it does not mean requests are already
		// using that private environment.
		if (configStore.cluster.clusterCodeCache) {
			setDeployment(LoginDeployment.PrivateDeploymentLogin)
		}
	})

	useDeepCompareEffect(() => {
		if (deployment === LoginDeployment.PublicDeploymentLogin) {
			// 切回公网登录时清空登录页局部 cluster，但保留缓存私有码，
			// 以便未来恢复私有化 UI /
			// Public login clears the login-scoped cluster while preserving the cached
			// private code for future UI restoration.
			setClusterCode("")
			return
		}

		if (shouldClearCachedCluster.current) {
			// Prevent an old cached cluster from replacing the unconfirmed Widget form value.
			setClusterCode("")
			shouldClearCachedCluster.current = false
			return
		}

		// 切回私有化登录时，把缓存私有码恢复到当前登录页局部 cluster /
		// Private login restores the remembered private code into the login-scoped
		// cluster for the current page session.
		setClusterCode(configStore.cluster.clusterCodeCache ?? "")
	}, [deployment, setClusterCode])

	const showPublicDeployment = useMemoizedFn(() => {
		setDeployment(LoginDeployment.PublicDeploymentLogin)
	})

	const showPrivateDeployment = useMemoizedFn(() => {
		setDeployment(LoginDeployment.PrivateDeploymentLogin)
	})

	return {
		clusterCode,
		deployment,
		prefilledDeploymentCode,
		showPrivateDeployment,
		showPublicDeployment,
		setPrivateClusterCode,
	}
}
