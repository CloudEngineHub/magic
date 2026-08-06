import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import SecondaryLayout from "@admin/layouts/SecondaryLayout"
import { RoutePath } from "@admin/const/routes"
import {
	IconPhotoAi,
	IconSubtitlesAi,
	IconVideo,
	IconUsers,
	IconSettingsAi,
	IconMenu2,
	IconRobot,
	IconSitemap,
	IconChartLine,
} from "@tabler/icons-react"
import {
	AI_APP_MENU,
	AI_CUSTOM_MODEL,
	AI_INTERNAL_EMPLOYEE_SKILL,
	AI_MANAGEMENT,
	PERMISSION_KEY_MAP,
} from "@admin/const/common"
import { useAdminStore } from "@admin/stores/admin"

function AIManagerLayout() {
	const { t } = useTranslation("admin/common")
	const { isOfficialOrg, isPersonalOrganization } = useAdminStore()
	const items = useMemo(() => {
		return [
			{
				key: RoutePath.AICustomModel,
				label: t("nav.aiSubMenu.customModel"),
				hidden: isOfficialOrg,
				validate: (permissions: string[], isSuperAdmin?: boolean) => {
					return (
						isSuperAdmin ||
						AI_CUSTOM_MODEL.some((permission) => permissions.includes(permission))
					)
				},
				children: [
					{
						key: RoutePath.AIModel,
						label: t("nav.platformSubMenu.modelManagement"),
						icon: <IconSubtitlesAi size={20} />,
						validate: (permissions: string[], isSuperAdmin?: boolean) => {
							return (
								isSuperAdmin ||
								permissions.includes(PERMISSION_KEY_MAP.MODEL_MANAGEMENT_QUERY) ||
								permissions.includes(PERMISSION_KEY_MAP.MODEL_MANAGEMENT_EDIT)
							)
						},
					},
					{
						key: RoutePath.AIDrawing,
						label: t("nav.platformSubMenu.intelligentDrawing"),
						icon: <IconPhotoAi size={20} />,
						validate: (permissions: string[], isSuperAdmin?: boolean) => {
							return (
								isSuperAdmin ||
								permissions.includes(
									PERMISSION_KEY_MAP.INTELLIGENT_DRAWING_QUERY,
								) ||
								permissions.includes(PERMISSION_KEY_MAP.INTELLIGENT_DRAWING_EDIT)
							)
						},
					},
					{
						key: RoutePath.AIVideo,
						label: t("nav.platformSubMenu.videoManagement"),
						icon: <IconVideo size={20} />,
						validate: (permissions: string[], isSuperAdmin?: boolean) => {
							return (
								isSuperAdmin ||
								permissions.includes(
									PERMISSION_KEY_MAP.INTELLIGENT_DRAWING_QUERY,
								) ||
								permissions.includes(PERMISSION_KEY_MAP.INTELLIGENT_DRAWING_EDIT)
							)
						},
					},
				],
			},
			{
				key: RoutePath.AIInternalEmployeeSkill,
				label: t("nav.aiSubMenu.internalEmployeeSkill"),
				hidden: isPersonalOrganization,
				validate: (permissions: string[], isSuperAdmin?: boolean) => {
					return (
						isSuperAdmin ||
						AI_INTERNAL_EMPLOYEE_SKILL.some((permission) =>
							permissions.includes(permission),
						)
					)
				},
				children: [
					{
						key: RoutePath.AIEmployeeReview,
						label: t("nav.aiSubMenu.employeePublishReview"),
						icon: <IconUsers size={20} />,
						validate: (permissions: string[], isSuperAdmin?: boolean) => {
							return (
								isSuperAdmin ||
								AI_INTERNAL_EMPLOYEE_SKILL.some((permission) =>
									permissions.includes(permission),
								)
							)
						},
					},
					{
						key: RoutePath.AISkillReview,
						label: t("nav.aiSubMenu.skillPublishReview"),
						icon: <IconSettingsAi size={20} />,
						validate: (permissions: string[], isSuperAdmin?: boolean) => {
							return (
								isSuperAdmin ||
								AI_INTERNAL_EMPLOYEE_SKILL.some((permission) =>
									permissions.includes(permission),
								)
							)
						},
					},
				],
			},
			{
				key: RoutePath.AIDataStatistics,
				label: t("nav.aiSubMenu.dataStatistics"),
				hidden: isPersonalOrganization,
				validate: (permissions: string[], isSuperAdmin?: boolean) => {
					return (
						isSuperAdmin ||
						AI_MANAGEMENT.some((permission) => permissions.includes(permission))
					)
				},
				children: [
					{
						key: RoutePath.AIDataDashboardMemberAnalysis,
						label: t("nav.aiSubMenu.memberAnalysis"),
						icon: <IconUsers size={20} />,
						validate: (permissions: string[], isSuperAdmin?: boolean) => {
							return (
								isSuperAdmin ||
								AI_MANAGEMENT.some((permission) => permissions.includes(permission))
							)
						},
					},
					{
						key: RoutePath.AIDataDashboardOrganizationAnalysis,
						label: t("nav.aiSubMenu.organizationAnalysis"),
						icon: <IconSitemap size={20} />,
						validate: (permissions: string[], isSuperAdmin?: boolean) => {
							return (
								isSuperAdmin ||
								AI_MANAGEMENT.some((permission) => permissions.includes(permission))
							)
						},
					},
					{
						key: RoutePath.AIDataDashboardDigitalEmployeeAnalysis,
						label: t("nav.aiSubMenu.digitalEmployeeAnalysis"),
						icon: <IconRobot size={20} />,
						validate: (permissions: string[], isSuperAdmin?: boolean) => {
							return (
								isSuperAdmin ||
								AI_MANAGEMENT.some((permission) => permissions.includes(permission))
							)
						},
					},
					{
						key: RoutePath.AIDataDashboardConsumptionAnalysis,
						label: t("nav.aiSubMenu.consumptionAnalysis"),
						icon: <IconChartLine size={20} />,
						validate: (permissions: string[], isSuperAdmin?: boolean) => {
							return (
								isSuperAdmin ||
								AI_MANAGEMENT.some((permission) => permissions.includes(permission))
							)
						},
					},
				],
			},
			{
				key: RoutePath.AIManage,
				label: t("nav.aiSubMenu.manage"),
				hidden: isOfficialOrg,
				validate: (permissions: string[], isSuperAdmin?: boolean) => {
					return (
						isSuperAdmin ||
						AI_APP_MENU.some((permission) => permissions.includes(permission))
					)
				},
				children: [
					{
						key: RoutePath.AIAppMenu,
						label: t("nav.aiSubMenu.applicationMenu"),
						icon: <IconMenu2 size={20} />,
						validate: (permissions: string[], isSuperAdmin?: boolean) => {
							return (
								isSuperAdmin ||
								AI_APP_MENU.some((permission) => permissions.includes(permission))
							)
						},
					},
				],
			},
		]
	}, [t, isOfficialOrg, isPersonalOrganization])

	return (
		<SecondaryLayout
			items={items}
			openKeys={[
				RoutePath.AICustomModel,
				RoutePath.AIInternalEmployeeSkill,
				RoutePath.AIDataStatistics,
				RoutePath.AIManage,
			]}
		/>
	)
}

export default AIManagerLayout
