import { useEffect, useMemo, useState } from "react"
import { useAccount } from "@/models/user/hooks/useAccount"
import { useOrganization } from "@/models/user/hooks/useOrganization"
import { useAuthorization } from "@/models/user/hooks/useAuthorization"
import { useUserInfo } from "@/models/user/hooks/useUserInfo"
import { useSwitchOrganization } from "@/hooks/account/useSwitchOrganization"
import { awaitAppInitPromise } from "@/apis/clients/await-app-init"
import type { User } from "@/types/user"

export type CrewConversationOrganizationGuardStatus = "loading" | "ready" | "switching" | "error"

interface CrewConversationOrganizationTarget {
	account: User.UserAccount
	organization: User.MagicOrganization
}

function findOrganizationTarget(
	accounts: User.UserAccount[],
	magicOrganizationCode: string | null,
): CrewConversationOrganizationTarget | null {
	if (!magicOrganizationCode) return null

	for (const account of accounts) {
		const organization = account.organizations?.find(
			(item) => item.magic_organization_code === magicOrganizationCode,
		)

		if (organization) {
			return { account, organization }
		}
	}

	return null
}

function createCurrentSessionOrganizationTarget(params: {
	magicOrganizationCode: string | null
	organizationCode: string
	magicOrganizationMap: Record<string, User.MagicOrganization>
	teamshareOrganizations: User.UserOrganization[]
	userInfo: User.UserInfo | null
	authorization: string | null
}): CrewConversationOrganizationTarget | null {
	const {
		magicOrganizationCode,
		organizationCode,
		magicOrganizationMap,
		teamshareOrganizations,
		userInfo,
		authorization,
	} = params

	if (!magicOrganizationCode || !userInfo) return null

	const organization = magicOrganizationMap[magicOrganizationCode]
	if (!organization) return null

	return {
		account: {
			deployCode: "",
			magic_id: organization.magic_id || userInfo.magic_id,
			magic_user_id: organization.magic_user_id || userInfo.user_id,
			nickname: userInfo.nickname,
			organizationCode: organizationCode || userInfo.organization_code,
			avatar: userInfo.avatar,
			access_token: authorization ?? "",
			organizations: Object.values(magicOrganizationMap),
			teamshareOrganizations,
		},
		organization,
	}
}

export function useCrewConversationOrganizationGuard(magicOrganizationCode: string | null) {
	const { accounts } = useAccount()
	const { authorization } = useAuthorization()
	const { userInfo } = useUserInfo()
	const { organizationCode, organizations, magicOrganizationMap, organizationListReady } =
		useOrganization()
	const [status, setStatus] = useState<CrewConversationOrganizationGuardStatus>("loading")
	const [appInitReady, setAppInitReady] = useState(false)
	const [error, setError] = useState<unknown>(null)
	const switchOrganization = useSwitchOrganization({
		disabled: false,
	})

	// Wait for app init (login flow) to complete before executing guard logic
	useEffect(() => {
		let isActive = true

		void awaitAppInitPromise().then(() => {
			if (isActive) setAppInitReady(true)
		})

		return () => {
			isActive = false
		}
	}, [])

	const hasRouteOrganization = Boolean(magicOrganizationCode)

	const target = useMemo(() => {
		if (!appInitReady) return null

		return (
			findOrganizationTarget(accounts, magicOrganizationCode) ??
			createCurrentSessionOrganizationTarget({
				magicOrganizationCode,
				organizationCode,
				magicOrganizationMap,
				teamshareOrganizations: organizations,
				userInfo,
				authorization,
			})
		)
	}, [
		appInitReady,
		accounts,
		authorization,
		magicOrganizationCode,
		magicOrganizationMap,
		organizationCode,
		organizations,
		userInfo,
	])

	const isCurrentOrganizationMatched = useMemo(() => {
		if (!appInitReady) return false
		if (!hasRouteOrganization) return true

		if (magicOrganizationCode && organizationCode === magicOrganizationCode) {
			return true
		}

		return Boolean(target && organizationCode === target.organization.magic_organization_code)
	}, [appInitReady, hasRouteOrganization, magicOrganizationCode, organizationCode, target])

	useEffect(() => {
		if (!appInitReady) {
			setStatus("loading")
			return
		}

		if (!hasRouteOrganization || isCurrentOrganizationMatched) {
			setStatus("ready")
			setError(null)
			return
		}

		if (!target) {
			if (!organizationListReady) {
				setStatus("switching")
				setError(null)
				return
			}

			setStatus("error")
			setError(new Error("crew-conversation-organization-not-found"))
			return
		}

		let isActive = true

		setStatus("switching")
		setError(null)

		void switchOrganization(target.account, target.organization)
			.then(() => {
				if (!isActive) return
				setStatus("ready")
			})
			.catch((nextError) => {
				if (!isActive) return
				setStatus("error")
				setError(nextError)
			})

		return () => {
			isActive = false
		}
	}, [
		appInitReady,
		hasRouteOrganization,
		isCurrentOrganizationMatched,
		organizationListReady,
		switchOrganization,
		target,
	])

	return {
		status,
		error,
		isReady: status === "ready",
	}
}
