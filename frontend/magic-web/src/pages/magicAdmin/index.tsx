import { AdminProvider, AppEnv, AdminProviderProps } from "@dtyq/magic-admin/provider"
import { AdminComponentsProvider, LanguageType, ThemeType } from "@dtyq/magic-admin/components"
import { Navigate } from "react-router"
import { useMemo, PropsWithChildren } from "react"
import { useAreaCodes, useGlobalLanguage, useTheme } from "@/models/config/hooks"
import { observer } from "mobx-react-lite"
import { defaultMagicClient as magicClient } from "@/infrastructure/network/http/runtime"
import { useMainTranslation } from "@/hooks/i18n/useMainTranslation"
import { useClusterCode } from "@/providers/ClusterProvider"
import { userStore } from "@/models/user"
import { isPrivateDeployment, env } from "@/utils/env"
import { useOrganization, useAccount, useCurrentMagicOrganization } from "@/models/user/hooks"
import useNavigate from "@/routes/hooks/useNavigate"
import { useSafeArea } from "@/providers/AppearanceProvider/hooks/useSafeArea"

const MagicAdminProvider = observer(({ children }: PropsWithChildren) => {
	const { prefersColorScheme } = useTheme()
	const safeArea = useSafeArea()
	const organizationInfo = useCurrentMagicOrganization()
	const { accounts } = useAccount()
	const { areaCodes } = useAreaCodes()
	const { clusterCode } = useClusterCode()
	const { organizationCode } = useOrganization()
	const navigate = useNavigate()
	const { t: tMainCommon } = useMainTranslation("common")

	const { userInfo, isPersonalOrganization, authorization } = userStore.user

	const currentTsUserId = useMemo(() => {
		const account = accounts.find((account) => account.magic_id === userInfo?.magic_id)
		return account?.organizations.find(
			(organization) => organization.magic_organization_code === userInfo?.organization_code,
		)?.third_platform_user_id
	}, [accounts, userInfo])

	const lang = useGlobalLanguage(false)
	const platformName = tMainCommon("platform.name")

	const config: AdminProviderProps = useMemo(
		() => ({
			language: lang as LanguageType,
			theme: prefersColorScheme,
			platformName,
			apiClients: {
				magicClient: magicClient as any,
			},
			clusterCode,
			isPersonalOrganization,
			isPrivateDeployment: isPrivateDeployment(),
			organization: {
				organizationCode,
				organizationInfo,
			},
			user: {
				token: authorization,
				userInfo: userInfo
					? {
							id: currentTsUserId,
							...userInfo,
						}
					: null,
				teamshareUserInfo: null,
			},
			env: {
				MAGIC_APP_ENV: env("MAGIC_APP_ENV") as AppEnv,
				MAGIC_BASE_URL: env("MAGIC_SERVICE_BASE_URL"),
			},
			areaCodes,
			navigate,
			Navigate,
			safeAreaInset: {
				top: safeArea.safeAreaInsetTop,
				bottom: safeArea.safeAreaInsetBottom,
			},
		}),
		[
			lang,
			prefersColorScheme,
			clusterCode,
			isPersonalOrganization,
			organizationCode,
			organizationInfo,
			authorization,
			userInfo,
			currentTsUserId,
			areaCodes,
			navigate,
			safeArea.safeAreaInsetTop,
			safeArea.safeAreaInsetBottom,
			platformName,
		],
	)

	return (
		<AdminProvider {...config}>
			<AdminComponentsProvider
				language={lang as LanguageType}
				theme={prefersColorScheme as ThemeType}
			>
				{children}
			</AdminComponentsProvider>
		</AdminProvider>
	)
})

export default MagicAdminProvider
