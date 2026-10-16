import { lazy } from "react"
import { Navigate } from "@admin/pages/Navigate"
import { RouteName, RoutePath } from "@admin/const/routes"
import {
	AI_MANAGEMENT,
	PERMISSION_KEY_MAP,
	AI_CUSTOM_MODEL,
	AI_INTERNAL_EMPLOYEE_SKILL,
	AI_EMPLOYEE_REVIEW,
	AI_SKILL_REVIEW,
	AI_APP_MENU,
	AI_DATA_DASHBOARD,
} from "@admin/const/common"
import { DataDashboardView } from "./DataDashboard/consts"

/**
 * @description 路由处理器，需要异步渲染，等待路由生成再渲染再执行对应业务流程
 */
const AiManageLayout = lazy(() => import("./index.layout"))
const ModelPage = lazy(() => import("../PlatformPackage/Model/index.page"))
const ModelDetailPage = lazy(() => import("../PlatformPackage/ModelDetail/index.page"))
const AIDrawingPage = lazy(() => import("../PlatformPackage/AIDrawing/index.page"))
const AIDrawingDetailPage = lazy(() => import("../PlatformPackage/AIDrawingDetail/index.page"))
const AIVideoPage = lazy(() => import("../PlatformPackage/VideoModel/index.page"))
const AIVideoDetailPage = lazy(() => import("../PlatformPackage/VedioModelDetail/index.page"))
const EmployeeReviewPage = lazy(() => import("./EmployeeReview/index.page"))
const SkillReviewPage = lazy(() => import("./SkillReview/index.page"))
const AppMenuPage = lazy(() => import("./AppMenu/index.page"))
const DataDashboardPage = lazy(() => import("./DataDashboard/index.page"))

const canAccessAIModel = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin ||
	permissions.includes(PERMISSION_KEY_MAP.MODEL_MANAGEMENT_QUERY) ||
	permissions.includes(PERMISSION_KEY_MAP.MODEL_MANAGEMENT_EDIT)

const canAccessAIDrawing = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin ||
	permissions.includes(PERMISSION_KEY_MAP.INTELLIGENT_DRAWING_QUERY) ||
	permissions.includes(PERMISSION_KEY_MAP.INTELLIGENT_DRAWING_EDIT)

const canAccessAIVideo = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin ||
	permissions.includes(PERMISSION_KEY_MAP.VIDEO_MODEL_QUERY) ||
	permissions.includes(PERMISSION_KEY_MAP.VIDEO_MODEL_EDIT)

const canAccessAICustomModel = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin || AI_CUSTOM_MODEL.some((permission) => permissions.includes(permission))

const canAccessAIInternalEmployeeSkill = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin ||
	AI_INTERNAL_EMPLOYEE_SKILL.some((permission) => permissions.includes(permission))

const canAccessAIEmployeeReview = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin || AI_EMPLOYEE_REVIEW.some((permission) => permissions.includes(permission))

const canAccessAISkillReview = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin || AI_SKILL_REVIEW.some((permission) => permissions.includes(permission))

const canAccessAIAppMenu = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin || AI_APP_MENU.some((permission) => permissions.includes(permission))

const canAccessAIDataStatistics = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin || AI_DATA_DASHBOARD.some((permission) => permissions.includes(permission))

const canAccessMemberAnalysis = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin || permissions.includes(PERMISSION_KEY_MAP.DATA_DASHBOARD_MEMBER_QUERY)

const canAccessOrganizationAnalysis = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin || permissions.includes(PERMISSION_KEY_MAP.DATA_DASHBOARD_ORGANIZATION_QUERY)

const canAccessDigitalEmployeeAnalysis = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin || permissions.includes(PERMISSION_KEY_MAP.DATA_DASHBOARD_AGENT_QUERY)

const canAccessConsumptionAnalysis = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin || permissions.includes(PERMISSION_KEY_MAP.DATA_DASHBOARD_CONSUMPTION_QUERY)

const canAccessFileProductionAnalysis = (permissions: string[], isSuperAdmin?: boolean) =>
	isSuperAdmin || permissions.includes(PERMISSION_KEY_MAP.DATA_DASHBOARD_FILE_QUERY)

export default {
	name: RouteName.AdminAILayout,
	path: RoutePath.AI,
	element: <AiManageLayout />,
	title: "nav.ai",
	validate: (permissions: string[], isSuperAdmin?: boolean) => {
		return isSuperAdmin || AI_MANAGEMENT.some((permission) => permissions.includes(permission))
	},
	children: [
		{
			index: true,
			element: <Navigate to={RoutePath.AIModel} replace />,
		},
		{
			name: RouteName.AdminAICustomModel,
			validateOrganization: ({ isOfficialOrg }) => !isOfficialOrg,
			path: RoutePath.AICustomModel,
			title: "nav.aiSubMenu.customModel",
			validate: canAccessAICustomModel,
			children: [
				{
					index: true,
					element: <Navigate to={RoutePath.AIModel} replace />,
				},
				{
					name: RouteName.AdminAIModel,
					path: RoutePath.AIModel,
					element: <ModelPage />,
					title: "nav.platformSubMenu.modelManagement",
					validate: canAccessAIModel,
				},
				{
					name: RouteName.AdminAIModelDetails,
					path: RoutePath.AIModelDetail,
					element: <ModelDetailPage />,
					validate: canAccessAIModel,
				},
				{
					name: RouteName.AdminAIDrawing,
					path: RoutePath.AIDrawing,
					element: <AIDrawingPage />,
					title: "nav.platformSubMenu.intelligentDrawing",
					validate: canAccessAIDrawing,
				},
				{
					name: RouteName.AdminAIDrawingDetails,
					path: RoutePath.AIDrawingDetail,
					element: <AIDrawingDetailPage />,
					validate: canAccessAIDrawing,
				},
				{
					name: RouteName.AdminAIVideo,
					path: RoutePath.AIVideo,
					element: <AIVideoPage />,
					title: "nav.platformSubMenu.videoManagement",
					validate: canAccessAIVideo,
				},
				{
					name: RouteName.AdminAIVideoDetails,
					path: RoutePath.AIVideoDetail,
					element: <AIVideoDetailPage />,
					validate: canAccessAIVideo,
				},
			],
		},
		{
			name: RouteName.AdminAIInternalEmployeeSkill,
			validateOrganization: ({ isPersonalOrganization }) => !isPersonalOrganization,
			path: RoutePath.AIInternalEmployeeSkill,
			title: "nav.aiSubMenu.internalEmployeeSkill",
			validate: canAccessAIInternalEmployeeSkill,
			children: [
				{
					index: true,
					element: <Navigate to={RoutePath.AIEmployeeReview} replace />,
				},
				{
					name: RouteName.AdminAIEmployeeReview,
					path: RoutePath.AIEmployeeReview,
					element: <EmployeeReviewPage />,
					title: "nav.aiSubMenu.employeePublishReview",
					validate: canAccessAIEmployeeReview,
				},
				{
					name: RouteName.AdminAISkillReview,
					path: RoutePath.AISkillReview,
					element: <SkillReviewPage />,
					title: "nav.aiSubMenu.skillPublishReview",
					validate: canAccessAISkillReview,
				},
			],
		},
		{
			name: RouteName.AdminAIDataStatistics,
			validateOrganization: ({ isPersonalOrganization }) => !isPersonalOrganization,
			path: RoutePath.AIDataStatistics,
			title: "nav.aiSubMenu.dataStatistics",
			validate: canAccessAIDataStatistics,
			children: [
				{
					index: true,
					element: <Navigate to={RoutePath.AIDataDashboardMemberAnalysis} replace />,
				},
				{
					name: RouteName.AdminAIDataDashboardMemberAnalysis,
					path: RoutePath.AIDataDashboardMemberAnalysis,
					element: <DataDashboardPage view={DataDashboardView.MemberAnalysis} />,
					title: "nav.aiSubMenu.memberAnalysis",
					validate: canAccessMemberAnalysis,
				},
				{
					name: RouteName.AdminAIDataDashboardOrganizationAnalysis,
					path: RoutePath.AIDataDashboardOrganizationAnalysis,
					element: <DataDashboardPage view={DataDashboardView.OrganizationAnalysis} />,
					title: "nav.aiSubMenu.organizationAnalysis",
					validate: canAccessOrganizationAnalysis,
				},
				{
					name: RouteName.AdminAIDataDashboardDigitalEmployeeAnalysis,
					path: RoutePath.AIDataDashboardDigitalEmployeeAnalysis,
					element: <DataDashboardPage view={DataDashboardView.DigitalEmployeeAnalysis} />,
					title: "nav.aiSubMenu.digitalEmployeeAnalysis",
					validate: canAccessDigitalEmployeeAnalysis,
				},
				{
					name: RouteName.AdminAIDataDashboardConsumptionAnalysis,
					path: RoutePath.AIDataDashboardConsumptionAnalysis,
					element: <DataDashboardPage view={DataDashboardView.ConsumptionAnalysis} />,
					title: "nav.aiSubMenu.consumptionAnalysis",
					validate: canAccessConsumptionAnalysis,
				},
				{
					name: RouteName.AdminAIDataDashboardFileProductionAnalysis,
					path: RoutePath.AIDataDashboardFileProductionAnalysis,
					element: <DataDashboardPage view={DataDashboardView.FileProductionAnalysis} />,
					title: "nav.aiSubMenu.fileProductionAnalysis",
					validate: canAccessFileProductionAnalysis,
				},
			],
		},
		{
			name: RouteName.AdminAIManage,
			path: RoutePath.AIManage,
			title: "nav.aiSubMenu.manage",
			validate: canAccessAIAppMenu,
			children: [
				{
					index: true,
					element: <Navigate to={RoutePath.AIAppMenu} replace />,
				},
				{
					name: RouteName.AdminAIAppMenu,
					validateOrganization: ({ isOfficialOrg }) => !isOfficialOrg,
					path: RoutePath.AIAppMenu,
					element: <AppMenuPage />,
					title: "nav.aiSubMenu.applicationMenu",
					validate: canAccessAIAppMenu,
				},
			],
		},
	],
}
