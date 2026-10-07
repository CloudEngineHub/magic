import { useOrganization } from "@/models/user/hooks"
import { isPrivateDeployment } from "@/utils/env"

/**
 * Whether this deployment and this organization are the ones the new-user onboarding belongs to.
 *
 * The whole feature — the benefits card, the introduction dialog and every guided run behind it —
 * exists for the **SaaS personal plan** only, and the two facts that say so are unrelated to each
 * other:
 *
 * - **A private deployment** does not ship it at all. That answer is available synchronously, from
 *   the environment, and it is final: no account on such a deployment ever gets the feature.
 * - **A team organization** does not get it either. That answer is not available until the
 *   organization list has been fetched, because being a personal organization is a property of the
 *   organization rather than of the account, and the store starts out knowing neither.
 *
 * Both are answered **before** anything mounts, which is the point of keeping them in one place:
 * every surface that carries the feature asks this first and renders nothing when the answer is no.
 * A component that mounts and then hides still runs its effects, still asks the backend for a reward
 * list it will throw away, and still pulls its lazy chunk; a component that never mounts does none
 * of that.
 *
 * `organizationListReady` is part of the answer rather than an implementation detail. Before the
 * list lands, `isPersonalOrganization` is `false` for everybody — the store simply has not been
 * told yet — and treating that as "a team organization" would be a guess that hides the feature
 * from the very users it is for. Waiting costs a beat; guessing is wrong in whichever direction it
 * lands.
 */
export interface HomeOnboardingDeployment {
	/** 私有化部署：整套功能不存在。 */
	privateDeployment: boolean
	/** 组织列表是否已拉到 —— 在此之前无法断言组织形态。 */
	organizationListReady: boolean
	/** 当前组织是否个人组织；团队组织没有这套新人引导。 */
	personalOrganization: boolean
}

/**
 * The rule, on its own, so it can be read without a store or a renderer in the way.
 */
export function canHostHomeOnboarding(deployment: HomeOnboardingDeployment): boolean {
	if (deployment.privateDeployment) return false
	if (!deployment.organizationListReady) return false
	return deployment.personalOrganization
}

/**
 * Follows the two facts above. Both can change under a mounted page: the organization list arrives
 * after the first paint, and switching between a team and a personal organization flips the second
 * one outright — so a surface gated on this has to appear and disappear with it rather than decide
 * once on mount.
 */
export function useCanHostHomeOnboarding(): boolean {
	const { organizationListReady, isPersonalOrganization } = useOrganization()

	return canHostHomeOnboarding({
		privateDeployment: isPrivateDeployment(),
		organizationListReady,
		personalOrganization: isPersonalOrganization,
	})
}
