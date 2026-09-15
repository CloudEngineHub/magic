import type { AgentPublishTargetType, CrewAgentOrigin, CrewSourceType } from "@/apis/modules/crew"
import {
	CollaboratorPermissionEnum,
	type CollaboratorPermission,
} from "@/pages/superMagic/types/collaboration"
import { isOfficialPublisherType } from "@/pages/superMagic/pages/CrewMarket/employee-market/components/employee-card-shared"
import type { MyCrewView } from "@/services/crew/CrewService"

type MyCrewOriginFields = Pick<MyCrewView, "origin">

/** Resolve the source returned by the employee-list API. */
export function resolveMyCrewOrigin(employee: MyCrewOriginFields): CrewAgentOrigin | null {
	return employee.origin ?? null
}

export function isOfficialMyCrewAgent(employee: MyCrewOriginFields): boolean {
	return resolveMyCrewOrigin(employee) === "OFFICIAL"
}

export function resolveMyCrewOriginLabel(
	employee: MyCrewOriginFields,
	t: (key: string) => string,
): string | null {
	switch (resolveMyCrewOrigin(employee)) {
		case "OFFICIAL":
			return t("myCrewPage.origin.official")
		case "CREATED":
			return t("myCrewPage.origin.created")
		case "MARKET":
			return t("myCrewPage.origin.market")
		case "TEAM_SHARED":
			return t("myCrewPage.origin.organizationShared")
		default:
			return null
	}
}

export function isUnpublishedCreatedCrew(
	employee: Pick<MyCrewView, "sourceType" | "latestPublishedAt">,
): boolean {
	return employee.sourceType === "LOCAL_CREATE" && !employee.latestPublishedAt?.trim()
}

export function resolveMyCrewCreatedFooterBadgeLabel(
	sourceType: CrewSourceType,
	t: (key: string) => string,
	tCrewCreate: (key: string) => string,
): string {
	switch (sourceType) {
		case "MARKET":
			return t("myCrewPage.sourceStore")
		case "LOCAL_CREATE":
		default:
			return tCrewCreate("status.unpublished")
	}
}

export function resolveMyCrewPublishTargetLabel(
	publishTargetType: AgentPublishTargetType | null | undefined,
	t: (key: string) => string,
): string | null {
	switch (publishTargetType) {
		case "PRIVATE":
			return t("skillEditPage.publishPanel.targets.private.label")
		case "MEMBER":
			return t("skillEditPage.publishPanel.targets.specific_members.label")
		case "ORGANIZATION":
			return t("skillEditPage.publishPanel.targets.organization.label")
		case "MARKET":
			return t("skillEditPage.publishPanel.targets.crew_market.label")
		default:
			return null
	}
}

export function formatVersionBadge(version: string | null | undefined): string | null {
	if (!version) return null
	const trimmed = version.trim()
	if (!trimmed) return null
	return trimmed
}

export function resolveMyCrewPublisherLabel(
	publisherType: string | null | undefined,
	publisherName: string | null | undefined,
	t: (key: string) => string,
): string | null {
	const normalizedPublisherName = publisherName?.trim()
	if (normalizedPublisherName && publisherType && !isOfficialPublisherType(publisherType))
		return normalizedPublisherName

	switch (publisherType) {
		case "OFFICIAL":
			return t("skillsLibrary.official")
		case "OFFICIAL_BUILTIN":
			return t("employeeCard.officialBuiltin")
		case "USER":
			return t("employeeCard.publisherUser")
		case "VERIFIED_CREATOR":
			return t("employeeCard.publisherVerified")
		case "PARTNER":
			return t("employeeCard.publisherPartner")
		default:
			return null
	}
}

export function resolveTeamSharedCrewPermissions(userRole?: CollaboratorPermission) {
	if (
		userRole === CollaboratorPermissionEnum.OWNER ||
		userRole === CollaboratorPermissionEnum.MANAGE
	) {
		return {
			canEdit: true,
			canPublish: true,
			canDelete: true,
		}
	}

	if (userRole === CollaboratorPermissionEnum.EDITABLE) {
		return {
			canEdit: true,
			canPublish: true,
			canDelete: false,
		}
	}

	return {
		canEdit: false,
		canPublish: false,
		canDelete: false,
	}
}
