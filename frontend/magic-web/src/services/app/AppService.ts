import { service } from "../index"
import { v4 } from "uuid"
import { trackLogger } from "@/utils/log/trackLogger"
import { GlobalApi } from "@/apis"
import { botStore } from "@/stores/bot"
import { globalConfigStore } from "@/stores/globalConfig"
import { withTimeout } from "@/utils/promise"
import { logger as Logger } from "@/utils/log"
import { userStore } from "@/models/user"
import { RoutePath } from "@/constants/routes"
import { getHomeURL } from "@/utils/redirect"
import { history } from "@/routes/history"
import { matchPath } from "react-router"
import { LoginValueKey } from "@/pages/login/constants"
import { RouteName } from "@/routes/constants"
import { convertSearchParams, routesMatch } from "@/routes/history/helpers"
import { AppInitErrorCode, AppInitializationError, isAuthenticationFailure } from "./errors"
import type { User } from "@/types/user"
import type { SettingsAll } from "@/apis/types"
import type { ConfigService } from "@/services/config/ConfigService"
import type { UserService } from "@/services/user/UserService"
import type { AccountService } from "@/services/user/AccountService"
import type { LoginService } from "@/services/user/LoginService/LoginService"
import { appStore } from "@/stores/app"
import i18next from "i18next"
import {
	MagicPlatformServiceInterface,
	PlatformServiceInterface,
} from "./types/platformServiceInterface"
import { AppServiceContext } from "./types"
import { AbstractAppService } from "./AbstractAppService"
import { Platform } from "./const/platform"
import { Config } from "@/models/config"
import { whiteListRoutes } from "@/routes/const/whiteRoutes"
import { interfaceStore } from "@/stores/interface"
import { BroadcastChannelSender } from "@/broadcastChannel"
import { defaultClusterCode } from "@/routes/helpers"
import { DEFAULT_MAINTENANCE_CONFIG, shouldForceSiteClose } from "@/constants/maintenance"
import { refreshAccountContextPage } from "@/broadcastChannel/eventFactory/accountContextRefresh"
import { authEventBus } from "@/services/auth/AuthEventBus"
import { AuthEventName } from "@/services/auth/AuthEvents"

interface PlatformServiceFactory {
	(context: AppServiceContext): Promise<PlatformServiceInterface>
}

const platformServiceFactories: Record<Platform, PlatformServiceFactory> = {
	[Platform.APIPlatform]: async (context) => {
		const { default: APIPlatformService } = await import("@/services/app/platformServices/api")
		return new APIPlatformService(context)
	},
	[Platform.AdminPlatform]: async (context) => {
		const { default: AdminPlatformService } =
			await import("@/services/app/platformServices/admin")
		return new AdminPlatformService(context)
	},
	[Platform.Magic]: async (context) => {
		const { default: MagicPlatformService } =
			await import("@/services/app/platformServices/magic")
		return new MagicPlatformService(context)
	},
}

const appInitSkipWaitRequestOptions = {
	skipAppInitWait: true,
} as const

const AuthenticationKey = "authorization"

/**
 * Application initialization result enum.
 */
export enum AppInitResult {
	/** Initialization succeeded */
	SUCCESS = "SUCCESS",
	/** No access token, but the current route is public, so lightweight initialization may continue */
	NO_TOKEN_PUBLIC_ROUTE = "NO_TOKEN_PUBLIC_ROUTE",
	/** No access token, but the route is allowlisted, so initialization may continue */
	NO_TOKEN_WHITELIST = "NO_TOKEN_WHITELIST",
	/** No access token; redirected to the login page */
	NO_TOKEN_REDIRECTED = "NO_TOKEN_REDIRECTED",
	/** Initialization failed; redirected to the login page */
	INIT_FAILED_REDIRECTED = "INIT_FAILED_REDIRECTED",
	/** Initialization failed for a non-authentication reason; kept the current route */
	INIT_FAILED_NO_REDIRECT = "INIT_FAILED_NO_REDIRECT",
	/** Initialization failed on an allowlisted route */
	INIT_FAILED_WHITELIST = "INIT_FAILED_WHITELIST",
	/** System initialization is required; redirected to the initialization page */
	NEED_SYSTEM_INITIALIZATION = "NEED_SYSTEM_INITIALIZATION",
	/** The system is under maintenance; redirected to the maintenance page */
	SITE_MAINTENANCE = "SITE_MAINTENANCE",
}

/**
 * Application initialization result data.
 */
export interface AppInitResultData {
	/** Initialization result enum value */
	result: AppInitResult
	/** Current path */
	pathname: string
	/** Whether the route is allowlisted */
	isWhiteListRoute: boolean
	/** Whether an access token is present */
	hasAccessToken: boolean
	/** Error details, if any */
	error?: AppInitializationError
	/** Timestamp */
	timestamp: number
}

/**
 * Application initialization service.
 * @description Initializes the application's services.
 * @constructor
 */
class AppService extends AbstractAppService<AppInitResultData> {
	private platformService: PlatformServiceInterface | null = null
	private pendingPostInitUser: User.UserInfo | null = null
	private isConfigInitializing = false
	private configInitPromise: Promise<void> | null = null
	private configRetryTimer: number | null = null
	private configInitStatus: "idle" | "pending" | "success" | "failed" = "idle"
	private configInitRetryCount = 0
	private readonly configInitMaxRetry = 5
	private settingsAllPromise: Promise<SettingsAll> | null = null
	private authenticatedConfigPromise: Promise<void> | null = null

	private clearConfigRetryTimer() {
		if (this.configRetryTimer) {
			window.clearTimeout(this.configRetryTimer)
			this.configRetryTimer = null
		}
	}

	private scheduleConfigRetry() {
		if (this.configInitStatus === "success") {
			return
		}

		const baseDelay = 2000
		const maxDelay = 60000
		const delay = Math.min(maxDelay, baseDelay * 2 ** this.configInitRetryCount)

		if (this.configInitRetryCount >= this.configInitMaxRetry) {
			this.logger.error("配置初始化已达最大重试次数，停止继续重试", {
				retryCount: this.configInitRetryCount,
				maxRetry: this.configInitMaxRetry,
			})
			return
		}

		this.configInitRetryCount += 1

		this.clearConfigRetryTimer()
		this.configRetryTimer = window.setTimeout(() => {
			const runRetry = () => {
				this.initializePublicConfiguration().catch((error) => {
					this.logger.warn("公开配置初始化退避重试失败", error)
				})
			}

			if ("requestIdleCallback" in window) {
				requestIdleCallback?.(() => {
					runRetry()
				})
				return
			}

			runRetry()
		}, delay)
	}

	/**
	 * Loads platform settings, including the default language, default icon,
	 * platform configuration, and related settings.
	 * @returns Promise<SettingsAll>
	 * @throws AppInitializationError
	 */
	private loadSettingsAll = async () => {
		if (this.settingsAllPromise) return this.settingsAllPromise

		this.settingsAllPromise = GlobalApi.getSettingsAll(appInitSkipWaitRequestOptions).catch(
			(error) => {
				this.settingsAllPromise = null
				this.logger.error("加载平台配置失败", error)
				throw new AppInitializationError({
					code: AppInitErrorCode.PlatformSettingsRequestFailed,
					cause: error,
					message: "platform settings request failed",
				})
			},
		)

		return this.settingsAllPromise
	}

	logger = Logger.createLogger("appService")

	constructor() {
		super()
		this.initPlatformService()
	}

	private initPlatformService = async () => {
		if (this.platformService) return this.platformService

		const platformType = this.getPlatformType()

		const context: AppServiceContext = {
			logger: this.logger,
		}

		const loadPlatformService =
			platformServiceFactories[platformType] ?? platformServiceFactories[Platform.Magic]
		this.platformService = await loadPlatformService(context)
		return this.platformService
	}

	/**
	 * Creates and reports the initialization result.
	 */
	private createAndReportInitResult(
		result: AppInitResult,
		pathname: string,
		isWhiteListRoute: boolean,
		hasAccessToken: boolean,
		error?: AppInitializationError,
	): AppInitResultData {
		const resultData: AppInitResultData = {
			result,
			pathname,
			isWhiteListRoute,
			hasAccessToken,
			error,
			timestamp: Date.now(),
		}

		if (error) {
			this.logger.error("appInitError", result.toLowerCase(), error)
		}

		this.logger.report({
			namespace: "appInit",
			data: {
				event: "appInitResult",
				result: resultData.result,
				pathname: resultData.pathname,
				isWhiteListRoute: resultData.isWhiteListRoute,
				hasAccessToken: resultData.hasAccessToken,
				...(error && {
					error: error.message,
					errorStack: error.stack,
				}),
			},
		})

		return resultData
	}

	private async initializePublicConfiguration() {
		if (this.isConfigInitializing) {
			this.logger.log("公开配置初始化进行中，跳过重复调用")
			return this.configInitPromise
		}

		this.isConfigInitializing = true
		this.configInitStatus = "pending"
		this.clearConfigRetryTimer()

		this.configInitPromise = (async () => {
			await service.get<ConfigService>("configService").hydrateLanguageEarly()

			this.logger.log("加载公开配置服务")
			try {
				service
					.get<ConfigService>("configService")
					.loadConfig(appInitSkipWaitRequestOptions)
			} catch (error) {
				this.logger.error("加载配置服务失败", error)
				throw new AppInitializationError({
					code: AppInitErrorCode.ConfigLoadFailed,
					cause: error,
					message: "config load failed",
				})
			}

			const response = await this.loadSettingsAll()

			this.logger.log("开始公开配置初始化")

			const languageReadyPromise = withTimeout(
				service
					.get<ConfigService>("configService")
					.init({
						initializeI18n: response.platform_settings
							?.default_language as Config.LanguageValue,
					})
					.catch((error) => {
						this.logger.error("全局配置初始化失败", error)
						throw new AppInitializationError({
							code: AppInitErrorCode.ConfigInitFailed,
							cause: error,
							message: "config init failed",
						})
					}),
				10000,
				"configService 初始化超时 (10秒)",
			).catch((error) => {
				if (error instanceof AppInitializationError) {
					throw error
				}
				throw new AppInitializationError({
					code: AppInitErrorCode.ConfigInitTimeout,
					cause: error,
					message: "config init timeout",
				})
			})

			appStore.setLanguageReadyPromise(languageReadyPromise)

			const globalConfigInitPromise = globalConfigStore
				.initGlobalConfig(response.platform_settings, i18next, response.global_config)
				.catch((error) => {
					this.logger.error("全局配置语言包初始化失败", error)
					throw new AppInitializationError({
						code: AppInitErrorCode.GlobalConfigInitFailed,
						cause: error,
						message: "global config init failed",
					})
				})

			await Promise.all([globalConfigInitPromise, languageReadyPromise])

			this.configInitStatus = "success"
			this.configInitRetryCount = 0
			this.logger.log("公开配置初始化完成")
		})().catch((error) => {
			const configError =
				error instanceof AppInitializationError
					? error
					: new AppInitializationError({
							code: AppInitErrorCode.Unknown,
							cause: error,
							message: "config init failed",
						})
			this.configInitStatus = "failed"
			this.logger.warn("公开配置初始化失败，但不中断登录流程", configError)
			this.scheduleConfigRetry()
			throw configError
		})
		this.configInitPromise.finally(() => {
			this.isConfigInitializing = false
		})

		appStore.setPublicConfigInitPromise(this.configInitPromise)

		return this.configInitPromise
	}

	private async initializeAuthenticatedConfiguration() {
		if (this.authenticatedConfigPromise) {
			this.logger.log("登录后配置初始化进行中，跳过重复调用")
			return this.authenticatedConfigPromise
		}

		this.authenticatedConfigPromise = (async () => {
			const response = await this.loadSettingsAll()
			botStore.setDefaultIcon({ icons: response.defaultIcons })
			this.logger.log("登录后配置初始化完成")
		})().catch((error) => {
			this.authenticatedConfigPromise = null
			this.logger.warn("登录后配置初始化失败，但不中断登录流程", error)
			throw error
		})

		return this.authenticatedConfigPromise
	}

	private getPlatformType = () => {
		const pathname = window.location.pathname
		if (pathname.startsWith("/api")) {
			return Platform.APIPlatform
		}
		if (pathname.startsWith("/admin")) {
			return Platform.AdminPlatform
		}
		return Platform.Magic
	}

	async init(): Promise<AppInitResultData> {
		if (appStore.appInitPromise) {
			this.logger.log("应用初始化进行中，复用已有 promise")
			return appStore.appInitPromise as Promise<AppInitResultData>
		}

		let resolveAppInit!: (value: AppInitResultData) => void
		let rejectAppInit!: (reason?: unknown) => void

		const initPromise = new Promise<AppInitResultData>((resolve, reject) => {
			resolveAppInit = resolve
			rejectAppInit = reject
		})

		appStore.setAppInitPromise(initPromise)
		this.schedulePostAppInitUserData(initPromise)

		const initTask = (async () => {
			appStore.setIsInitialing(true)
			let pathname = window.location.pathname
			let isWhiteListRoute = this.isWhiteListRoute(pathname)
			let hasAccessToken = false

			try {
				this.logger.log("开始应用初始化")
				const traceId = sessionStorage.getItem("traceId") ?? v4()
				sessionStorage.setItem("traceId", traceId)
				this.logger.log("设置会话追踪ID", { traceId })
				trackLogger.setConfig({
					sessionId: traceId,
				})

				this.logger.log("初始化用户服务")
				await service
					.get<UserService>("userService")
					.init()
					.catch((error) => {
						this.logger.error("用户服务初始化失败", error)
						throw new AppInitializationError({
							code: AppInitErrorCode.UserInitFailed,
							cause: error,
							message: "user service init failed",
						})
					})

				pathname = window.location.pathname
				isWhiteListRoute = this.isWhiteListRoute(pathname)
				this.logger.log("检查路由信息", { pathname, isWhiteListRoute })

				this.initializePublicConfiguration().catch((error) => {
					this.logger.warn("公开配置初始化失败，但不中断登录流程", error)
				})

				// Check system initialization before login and allowlist routing to keep uninitialized instances off the login page.
				const needsInitialization = await this.checkSystemInitialization()
				if (needsInitialization) {
					this.logger.log("系统需要初始化，已重定向到初始化页面")
					return this.createAndReportInitResult(
						AppInitResult.NEED_SYSTEM_INITIALIZATION,
						pathname,
						false,
						false,
					)
				}

				const isSiteMaintenance = await this.checkSiteMaintenance()
				if (isSiteMaintenance) {
					this.logger.log("系统处于站点关闭维护状态，已重定向到维护页面")
					return this.createAndReportInitResult(
						AppInitResult.SITE_MAINTENANCE,
						pathname,
						true,
						false,
					)
				}

				const queryAuthorization = this.getQueryAuthorization()
				const accessToken = queryAuthorization ?? userStore.user.authorization
				hasAccessToken = !!accessToken
				this.logger.log("检查授权码", { hasAccessToken, fromQuery: !!queryAuthorization })

				if (!accessToken) {
					if (this.isPublicRoute(pathname)) {
						this.logger.log("无授权码但为公开路由，走轻初始化路径")
						return this.createAndReportInitResult(
							AppInitResult.NO_TOKEN_PUBLIC_ROUTE,
							pathname,
							isWhiteListRoute,
							hasAccessToken,
						)
					}

					this.logger.log("无授权码，重定向到登录页")
					this.redirectToLogin()
					return this.createAndReportInitResult(
						AppInitResult.NO_TOKEN_REDIRECTED,
						pathname,
						isWhiteListRoute,
						hasAccessToken,
					)
				}

				// Initialize the cluster first.
				await service.get<ConfigService>("configService").initialCluster()

				this.initializeAuthenticatedConfiguration().catch((error) => {
					this.logger.warn("登录后配置初始化失败，但不中断登录流程", error)
				})

				this.logger.log("开始初始化账户")
				await this.initAccount().catch((error) => {
					this.logger.error("账户初始化失败", error)
					throw new AppInitializationError({
						code: AppInitErrorCode.AccountInitFailed,
						cause: error,
						message: "account init failed",
					})
				})
				this.logger.log("账户初始化完成")

				// // Wait for config initialization to complete before finishing app init
				// this.logger.log("Wait for public configuration initialization to complete")
				// if (this.configInitPromise) {
				// 	await withTimeout(
				// 		this.configInitPromise,
				// 		15000,
				// 		"Timed out waiting for public configuration initialization (15 seconds)",
				// 	).catch((error) => {
				// 		this.logger.warn("Waiting for public configuration initialization failed without interrupting application initialization", error)
				// 	})
				// }

				// if (this.configInitStatus === "success") {
				// 	this.logger.log("Public configuration initialization completed")
				// } else {
				// 	this.logger.warn("Public configuration initialization is incomplete; current status:", this.configInitStatus)
				// }

				// if (this.authenticatedConfigPromise) {
				// 	await withTimeout(
				// 		this.authenticatedConfigPromise,
				// 		5000,
				// 		"Timed out waiting for post-login configuration initialization (5 seconds)",
				// 	).catch((error) => {
				// 		this.logger.warn("Waiting for post-login configuration initialization failed without interrupting application initialization", error)
				// 	})
				// }

				this.logger.log("应用初始化成功完成")
				return this.createAndReportInitResult(
					AppInitResult.SUCCESS,
					pathname,
					isWhiteListRoute,
					hasAccessToken,
				)
			} catch (error) {
				const initError =
					error instanceof AppInitializationError
						? error
						: new AppInitializationError({
								code: AppInitErrorCode.Unknown,
								cause: error,
								message: "app init failed",
							})
				this.logger.error("应用初始化失败", initError)
				const shouldRedirectToLogin =
					!isWhiteListRoute && isAuthenticationFailure(initError)
				if (shouldRedirectToLogin) {
					this.logger.log("非白名单路由，重定向到登录页")
					this.redirectToLogin()
				}

				return this.createAndReportInitResult(
					isWhiteListRoute
						? AppInitResult.INIT_FAILED_WHITELIST
						: shouldRedirectToLogin
							? AppInitResult.INIT_FAILED_REDIRECTED
							: AppInitResult.INIT_FAILED_NO_REDIRECT,
					pathname,
					isWhiteListRoute,
					hasAccessToken,
					initError,
				)
			} finally {
				appStore.setIsInitialing(false)
			}
		})()

		void initTask.then(resolveAppInit).catch(rejectAppInit)

		return initPromise
	}

	private getQueryAuthorization = () => {
		const url = new URL(window.location.href)
		const { searchParams } = url
		const authCode = searchParams.get(AuthenticationKey)
		if (authCode) {
			this.logger.log("从URL查询参数获取到授权码")
		}
		return authCode
	}

	private isLoginRoute = (pathname: string) =>
		pathname === RoutePath.Login || pathname === RoutePath.Invite

	private isPublicRoute = (pathname: string) =>
		this.isWhiteListRoute(pathname) || this.isLoginRoute(pathname)

	/**
	 * @description Determines whether the route is allowlisted.
	 * @returns boolean
	 */
	private isWhiteListRoute = (pathname: string) => {
		const isWhiteList = whiteListRoutes.some((o) => matchPath(o, pathname))
		if (isWhiteList) {
			this.logger.log("当前路由为白名单路由", { pathname })
		}
		return isWhiteList
	}

	/**
	 * @description Redirects to the login page.
	 */
	redirectToLogin = () => {
		if (window.location.pathname === RoutePath.Login) return
		this.logger.log("发布登录请求", { currentPath: window.location.pathname })
		authEventBus.emit(AuthEventName.RequestLogin, {
			reason: "missing-session",
			source: "app-init",
			returnTo: window.location.href,
			preserveQuery: true,
		})
	}

	/**
	 * @description Redirects to the initialization page.
	 */
	private redirectToInitialization = () => {
		const pathname = window.location.pathname

		if (pathname !== RoutePath.Initialization) {
			// Preserve the original redirect_url so initialization can return to the original page.
			const redirectUrl = new URL(window.location.href).searchParams.get(
				LoginValueKey.REDIRECT_URL,
			)

			this.logger.log("重定向到初始化页面", {
				currentPath: pathname,
				redirectUrl: redirectUrl ?? window.location.href,
			})

			history.replace({
				name: RouteName.Initialization,
				query: convertSearchParams(
					new URLSearchParams({
						[LoginValueKey.REDIRECT_URL]: redirectUrl ?? window.location.href,
					}),
				),
			})
		} else {
			this.logger.log("当前已在初始化页面，无需重定向")
		}
	}

	private redirectToMaintenance = () => {
		const pathname = window.location.pathname

		if (pathname !== RoutePath.Maintenance) {
			this.logger.log("重定向到维护页面", { currentPath: pathname })
			history.replace({ name: RouteName.Maintenance })
		} else {
			this.logger.log("当前已在维护页面，无需重定向")
		}
	}

	private checkSiteMaintenance = async (): Promise<boolean> => {
		if (this.getPlatformType() !== Platform.Magic) {
			return false
		}

		try {
			const response = await this.loadSettingsAll()
			globalConfigStore.setMaintenanceConfig(response.global_config)

			if (shouldForceSiteClose(response.global_config)) {
				this.redirectToMaintenance()
				return true
			}

			return false
		} catch (error) {
			this.logger.error("检查系统维护状态失败", error)
			return false
		}
	}

	/**
	 * @description Checks whether the system requires initialization.
	 * @returns Promise<boolean> Resolves to true when initialization is required
	 */
	private checkSystemInitialization = async (): Promise<boolean> => {
		try {
			const pathname = window.location.pathname

			// Return false on the initialization page to avoid a redirect loop.
			if (pathname === RoutePath.Initialization) {
				this.logger.log("当前已在初始化页面，跳过初始化检查")
				return false
			}

			// Reuse the public configuration request to avoid duplicate initialization requests.
			this.logger.log("检查系统是否需要初始化")
			const globalConfig = await this.loadSettingsAll()
				.then((response) => response.global_config)
				.catch((error) => {
					// If the request fails, assume initialization is not required and continue normally.
					this.logger.warn("获取公开配置失败，假设系统已初始化", error)
					return {
						...DEFAULT_MAINTENANCE_CONFIG,
						need_initial: false,
					}
				})
			globalConfigStore.setMaintenanceConfig(globalConfig)

			if (globalConfig.need_initial) {
				this.logger.log("系统需要初始化，跳转到初始化页面")
				this.redirectToInitialization()
				return true
			}

			this.logger.log("系统不需要初始化，继续正常流程")
			return false
		} catch (error) {
			this.logger.error("检查系统初始化状态失败", error)
			return false
		}
	}

	private initAccount = async () => {
		this.logger.log("开始初始化账户")
		const accessToken = this.getQueryAuthorization() ?? userStore.user.authorization
		if (!accessToken) {
			// Without an access token, a redirect is most likely required.
			this.logger.log("无授权码，跳过账户初始化")
			this.redirectToLogin()
			return
		}

		// Memory and data persistence synchronization authorization
		this.logger.log("设置用户授权信息")
		service.get<UserService>("userService").setAuthorization(accessToken)

		this.logger.log("同步集群配置")
		const { clusterCode } = await service
			.get<LoginService>("loginService")
			.syncClusterConfig(appInitSkipWaitRequestOptions)
		this.logger.log("集群配置同步完成", { clusterCode })

		this.logger.log("获取第三方平台组织信息")
		const {
			magicOrganizationMap,
			organizationCode,
			thirdPlatformOrganizations,
			thirdPlatformOrganizationCode,
		} = await service
			.get<LoginService>("loginService")
			.getThirdPlatformOrganizations(accessToken, clusterCode, appInitSkipWaitRequestOptions)
		this.logger.log("第三方平台组织信息获取完成", {
			organizationCode,
			thirdPlatformOrganizationCode,
			organizationsCount: thirdPlatformOrganizations?.length || 0,
		})

		this.logger.log("设置用户组织信息")
		service.get<UserService>("userService").setOrganization({
			organizationCode,
			teamshareOrganizationCode: thirdPlatformOrganizationCode,
			organizations: thirdPlatformOrganizations,
			magicOrganizationMap,
		})

		// Account system synchronization
		this.logger.log("同步账户系统")
		await service.get<LoginService>("loginService").accountSync(
			{
				deployCode: clusterCode,
				access_token: accessToken,
				magicOrganizationMap,
				organizations: thirdPlatformOrganizations,
				teamshareOrganizationCode: thirdPlatformOrganizationCode,
			},
			appInitSkipWaitRequestOptions,
		)
		this.logger.log("账户系统同步完成")

		// Temporary processing
		const isSearchRoutePath = window.location.pathname.indexOf("search.html") > -1
		if (!isSearchRoutePath && ["/", RoutePath.Login].includes(window.location.pathname)) {
			this.logger.log("当前在首页或登录页，获取首页URL并重定向")
			const historyParams = await getHomeURL()
			history.replace(historyParams)
			this.logger.log("已重定向到首页", historyParams)
		}
		// Synchronize account information (refresh the status of each account)
		this.logger.log("获取账户信息")

		const user = userStore.user.userInfo
		if (user) {
			this.logger.log("账户初始化完成，准备在 app init 完成后触发后置初始化流程")
			this.pendingPostInitUser = user
		}
	}

	/**
	 * @description Initializes the flow after switching users.
	 * @param user User information
	 * @param showSwitchLoading Whether to show the switching loading state
	 * @returns Promise<void>
	 */
	initUserData = async (user: User.UserInfo) => {
		if (!this.platformService) return
		return this.platformService.initUserData(user)
	}

	private triggerPostAppInitUserData(user: User.UserInfo) {
		Promise.resolve(this.initUserData(user)).catch((error) => {
			this.logger.error("应用启动后的用户数据初始化失败", error)
		})
	}

	private schedulePostAppInitUserData(initPromise: Promise<AppInitResultData>) {
		void initPromise
			.then((result) => {
				if (result.result !== AppInitResult.SUCCESS) {
					this.pendingPostInitUser = null
					return
				}

				const user = this.pendingPostInitUser
				this.pendingPostInitUser = null
				if (!user) return

				this.logger.log("app init 已完成，开始执行用户数据后置初始化")
				this.triggerPostAppInitUserData(user)
			})
			.catch((error) => {
				this.pendingPostInitUser = null
				this.logger.warn("调度用户数据后置初始化失败", error)
			})
	}

	/**
	 * @description Switches organizations.
	 * @param accountInfo Account information
	 * @param organizationInfo Organization information
	 * @param userInfo Current user information
	 * @param onSwitchAfter Callback invoked after switching
	 */
	switchOrganization = async (
		accountInfo: User.UserAccount,
		organizationInfo: User.MagicOrganization,
		userInfo: User.UserInfo | null,
		onSwitchAfter?: () => void,
	) => {
		this.logger.log("开始切换组织", {
			targetAccountId: accountInfo?.magic_id,
			targetOrgCode: organizationInfo?.magic_organization_code,
			currentAccountId: userInfo?.magic_id,
			currentOrgCode: userInfo?.organization_code,
		})
		try {
			interfaceStore.setIsSwitchingOrganization(true)
			let shouldRefreshAccountContext = false
			// When accounts differ, compare clusters first. If clusters also differ, switch the account before redirecting the route to the target cluster.
			if (accountInfo?.magic_id !== userInfo?.magic_id) {
				this.logger.log("检测到账号不一致，开始切换账号")
				// Set cluster code before switching account
				if (accountInfo.deployCode) {
					this.logger.log("设置集群代码", { deployCode: accountInfo.deployCode })
					await service
						.get<ConfigService>("configService")
						.setClusterCode(accountInfo.deployCode)
				}
				this.logger.log("执行账号切换")
				await service
					.get<AccountService>("accountService")
					.switchAccount(accountInfo.magic_id, organizationInfo.magic_organization_code)
				this.logger.log("账号切换完成，广播账号切换事件")
				// Broadcast account switch
				BroadcastChannelSender.switchAccount({
					magicId: accountInfo.magic_id,
					magicUserId: organizationInfo.magic_user_id,
					magicOrganizationCode: organizationInfo.magic_organization_code,
				})
				const routeMeta = routesMatch(window.location.pathname)
				if (routeMeta && routeMeta.route.name) {
					this.logger.log("更新路由参数", {
						routeName: routeMeta.route.name,
						clusterCode: accountInfo.deployCode || defaultClusterCode,
					})
					history.replace({
						name: routeMeta.route.name,
						params: {
							...routeMeta?.params,
							clusterCode: accountInfo.deployCode || defaultClusterCode,
						},
					})
				}

				const user = userStore.user.userInfo
				if (user) {
					this.logger.log("账号切换完成，开始初始化用户切换后的流程")
					await this.platformService?.initUserData(user)
				}
				shouldRefreshAccountContext = true
			} else if (organizationInfo?.magic_organization_code !== userInfo?.organization_code) {
				this.logger.log("检测到组织不一致，开始切换组织")
				try {
					await service
						.get<UserService>("userService")
						.switchOrganization(
							organizationInfo.magic_user_id,
							organizationInfo.magic_organization_code,
							userInfo,
						)
					this.logger.log("组织切换完成")

					const user = userStore.user.userInfo
					if (user) {
						this.logger.log("组织切换完成，开始初始化用户切换后的流程")
						await this.platformService?.initUserData(user)
					}
					shouldRefreshAccountContext = true
				} catch (err) {
					this.logger.error("组织切换失败，恢复当前组织", err)
					// Restore the current organization after a failed switch.
					service
						.get<UserService>("userService")
						.setMagicOrganizationCode(userInfo?.organization_code)
					service.get<UserService>("userService").setUserInfo(userInfo)
				}
			} else {
				this.logger.log("账号和组织均一致，无需切换")
			}
			onSwitchAfter?.()
			// Let panel cleanup finish first, then reload so account-scoped stores rebuild under the new account.
			if (shouldRefreshAccountContext) {
				refreshAccountContextPage()
			}
			this.logger.log("组织切换流程完成")
		} catch (err) {
			this.logger.error("切换组织过程中发生错误", err)
		} finally {
			interfaceStore.setIsSwitchingOrganization(false)
		}
	}

	private isMagicPlatform = () => {
		return this.platformService?.PlatformType === Platform.Magic
	}

	initChatDataIfNeeded = async (magicUser?: User.UserInfo) => {
		if (!this.platformService || !this.isMagicPlatform()) return

		return (this.platformService as MagicPlatformServiceInterface).initChatDataIfNeeded(
			magicUser,
		)
	}
}

export const appService = new AppService()
