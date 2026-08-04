import { useEffect, useMemo, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { awaitAppInitPromise } from "@/apis/clients/await-app-init"
import { ContactApi } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import { useSwitchOrganization } from "@/hooks/account/useSwitchOrganization"
import { useAccount, useOrganization } from "@/models/user/hooks"
import { userTransformer } from "@/models/user/transformers"
import { useTranslation } from "react-i18next"
import { reaction } from "mobx"
import type { User } from "@/types/user"
import { interfaceStore } from "@/stores/interface"
import {
	resolveRequiredProjectOrganizationCode,
	suppressProjectOrganizationAccessCheckForCurrentRoute,
} from "../services/projectOrganizationAccess"

type ProjectOrganizationAccessStatus = "loading" | "ready" | "switch-required" | "switching"

interface OrganizationTarget {
	account: User.UserAccount
	organization: User.MagicOrganization
}

function findOrganizationTarget(
	accounts: User.UserAccount[],
	organizationCode: string | null,
): OrganizationTarget | null {
	if (!organizationCode) return null

	for (const account of accounts) {
		const organization = account.organizations?.find(
			(item) => item.magic_organization_code === organizationCode,
		)
		if (organization) return { account, organization }
	}

	return null
}

/**
 * Gates normal project routes before their project/topic loaders mount. The accessibility endpoint is
 * intentionally fail-open so a transient lookup error retains the established project-route behavior.
 */
export function useProjectOrganizationAccess(projectId?: string) {
	const { t } = useTranslation("super")
	const { accounts } = useAccount()
	const { organizationCode, organizationListReady } = useOrganization()
	const [appInitReady, setAppInitReady] = useState(false)
	const [requiredOrganizationCode, setRequiredOrganizationCode] = useState<string | null>(null)
	const [isCheckingAccessibility, setIsCheckingAccessibility] = useState(true)
	const [isSwitching, setIsSwitching] = useState(false)
	const [targetUserInfo, setTargetUserInfo] = useState<User.UserInfo | null>(null)

	useEffect(
		() =>
			reaction(
				() => interfaceStore.isSwitchingOrganization,
				(isSwitchingOrganization) => {
					if (isSwitchingOrganization) {
						suppressProjectOrganizationAccessCheckForCurrentRoute()
					}
				},
			),
		[],
	)

	useEffect(() => {
		let isActive = true
		void awaitAppInitPromise().then(() => {
			if (isActive) setAppInitReady(true)
		})
		return () => {
			isActive = false
		}
	}, [])

	useEffect(() => {
		if (!appInitReady) return
		if (!projectId) {
			setRequiredOrganizationCode(null)
			setIsCheckingAccessibility(false)
			return
		}

		let isActive = true
		setIsCheckingAccessibility(true)
		setRequiredOrganizationCode(null)

		void resolveRequiredProjectOrganizationCode({
			projectId,
			currentOrganizationCode: organizationCode,
		})
			.then((requiredCode) => {
				if (!isActive) return
				setRequiredOrganizationCode(requiredCode)
			})
			.finally(() => {
				if (isActive) setIsCheckingAccessibility(false)
			})

		return () => {
			isActive = false
		}
	}, [appInitReady, organizationCode, projectId])

	const target = useMemo(
		() => findOrganizationTarget(accounts, requiredOrganizationCode),
		[accounts, requiredOrganizationCode],
	)
	const targetOrganizationCode = target?.organization.magic_organization_code

	useEffect(() => {
		let isActive = true
		setTargetUserInfo(null)

		if (!targetOrganizationCode) return () => undefined

		// Fetch the current user's identity in the destination organization so both switch screens
		// present the same avatar-and-name context before changing organizations.
		void ContactApi.getAccountUserInfo({ organization_code: targetOrganizationCode })
			.then((userInfo) => {
				if (isActive && userInfo) setTargetUserInfo(userTransformer(userInfo))
			})
			.catch((error) => {
				console.error("Failed to fetch shared-project target user info:", error)
			})

		return () => {
			isActive = false
		}
	}, [targetOrganizationCode])

	const switchOrganization = useSwitchOrganization({
		disabled: false,
		onSwitchBefore: () => setIsSwitching(true),
		onSwitchAfter: () => window.location.reload(),
	})

	const handleSwitchOrganization = useMemoizedFn(async () => {
		if (!target) return

		try {
			await switchOrganization(target.account, target.organization)
		} catch (error) {
			console.error("Failed to switch organization for shared project:", error)
			magicToast.error(t("collaborators.organizationSwitch.failed"))
			setIsSwitching(false)
		}
	})

	const status: ProjectOrganizationAccessStatus = useMemo(() => {
		if (!appInitReady || isCheckingAccessibility) return "loading"
		if (!requiredOrganizationCode) return "ready"
		if (isSwitching) return "switching"
		if (!target && !organizationListReady) return "loading"
		return target ? "switch-required" : "ready"
	}, [
		appInitReady,
		isCheckingAccessibility,
		isSwitching,
		organizationListReady,
		requiredOrganizationCode,
		target,
	])

	return {
		status,
		targetOrganization: target?.organization ?? null,
		targetUserInfo,
		handleSwitchOrganization,
	}
}
