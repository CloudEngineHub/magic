import { useState, useMemo, useEffect } from "react"
import { useMemoizedFn } from "ahooks"
import { useAccount } from "@/models/user/hooks/useAccount"
import { useOrganization } from "@/models/user/hooks/useOrganization"
import { useUserInfo } from "@/models/user/hooks/useUserInfo"
import { useSwitchOrganization } from "@/hooks/account/useSwitchOrganization"
import { userStore } from "@/models/user"
import magicToast from "@/components/base/MagicToaster/utils"
import { useTranslation } from "react-i18next"
import { ContactApi } from "@/apis"
import type { User } from "@/types/user"
import { findProjectOrganizationTarget } from "@/pages/superMagic/services/projectOrganizationAccess"

interface SharePermissionInfo {
	currentOrgName: string
	targetOrgName: string
	targetOrgLogo?: string | null
	userInfo: User.UserInfo | null
}

export function useSharePermission() {
	const { t } = useTranslation("super")
	const { accounts } = useAccount()
	const { organizationCode } = useOrganization()
	const { userInfo } = useUserInfo()
	const [requiredOrgCode, setRequiredOrgCode] = useState<string>("")
	const [isSwitching, setIsSwitching] = useState(false)
	const [targetUserInfo, setTargetUserInfo] = useState<User.UserInfo | null>(null)

	// Share links must switch the current account's organization only. Falling back to another
	// account can rewrite the /share/files URL through account-switch route handling.
	const target = useMemo(
		() =>
			findProjectOrganizationTarget(
				accounts,
				requiredOrgCode || null,
				userInfo?.magic_id ?? null,
			),
		[accounts, requiredOrgCode, userInfo?.magic_id],
	)

	// 组织切换 hook
	const switchOrganization = useSwitchOrganization({
		disabled: false,
		onSwitchAfter: () => {
			window.location.reload()
		},
		onSwitchBefore: () => {
			setIsSwitching(true)
		},
	})

	// 获取目标组织的用户信息
	useEffect(() => {
		async function fetchTargetUserInfo() {
			if (!requiredOrgCode || requiredOrgCode === organizationCode) {
				setTargetUserInfo(null)
				return
			}

			if (!target) {
				setTargetUserInfo(null)
				return
			}

			try {
				const userInfo = await ContactApi.getAccountUserInfo({
					organization_code: target.organization.magic_organization_code,
				})

				if (userInfo) {
					setTargetUserInfo({
						magic_id: userInfo.magic_id,
						user_id: userInfo.user_id,
						status: userInfo.status,
						nickname: userInfo.nickname,
						real_name: userInfo.real_name,
						avatar: userInfo.avatar_url,
						organization_code: userInfo.organization_code,
						phone: userInfo.phone,
						email: userInfo.email,
						country_code: userInfo.country_code,
						preferences: userInfo.preferences,
					})
				}
			} catch (error) {
				console.error("Failed to fetch target user info:", error)
				setTargetUserInfo(null)
			}
		}

		fetchTargetUserInfo()
	}, [requiredOrgCode, organizationCode, target])

	// 切换组织处理函数
	const handleSwitchOrganization = useMemoizedFn(async () => {
		if (!requiredOrgCode || requiredOrgCode === organizationCode) return

		if (!target) {
			magicToast.error(t("share.organizationNotFound"))
			return
		}

		try {
			await switchOrganization(target.account, target.organization)
		} catch (error) {
			console.error("Switch organization failed:", error)
			magicToast.error(t("share.switchOrganizationFailed"))
			setIsSwitching(false)
		}
	})

	// 计算显示信息
	const emptyStateInfo = useMemo<SharePermissionInfo | null>(() => {
		if (!requiredOrgCode || requiredOrgCode === organizationCode) return null

		if (!target) return null

		const currentOrgCode = userStore.user.organizationCode
		const currentOrg = currentOrgCode
			? userStore.user.organizations?.[Number(currentOrgCode)]
			: null

		return {
			currentOrgName: currentOrg?.organization_name || "",
			targetOrgName: target.organization.organization_name,
			targetOrgLogo: target.organization.organization_logo,
			userInfo: targetUserInfo,
		}
	}, [requiredOrgCode, organizationCode, target, targetUserInfo])

	return {
		emptyStateInfo,
		handleSwitchOrganization,
		isSwitching,
		setRequiredOrgCode,
	}
}
