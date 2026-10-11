import {
	Activity,
	AppWindow,
	ArrowRightLeft,
	BadgeCheck,
	BellRing,
	BarChart3,
	Blocks,
	BookOpen,
	Bot,
	Boxes,
	BrainCircuit,
	Building,
	Building2,
	Cable,
	ClipboardCheck,
	ClipboardList,
	Coins,
	Contact,
	Cpu,
	Database,
	FileCheck2,
	FileClock,
	FileOutput,
	FileSearch,
	FileSignature,
	FileText,
	FingerprintPattern,
	Gauge,
	GaugeCircle,
	Handshake,
	History,
	Hourglass,
	IdCard,
	Info,
	KeyRound,
	Landmark,
	LandPlot,
	ListChecks,
	LayoutDashboard,
	LayoutGrid,
	LayoutList,
	LineChart,
	MenuSquare,
	MessageSquareText,
	MonitorCog,
	Network,
	Package,
	PackageCheck,
	PieChart,
	Plug,
	Presentation,
	ReceiptText,
	Route as RouteIcon,
	ScanFace,
	ScrollText,
	ServerCog,
	Shield,
	ShieldAlert,
	ShieldCheck,
	Sliders,
	SlidersHorizontal,
	Sparkles,
	Store,
	UserCog,
	UserRoundCheck,
	Users,
	UsersRound,
	Wallet,
	Wrench,
	Workflow,
	type LucideIcon,
} from "lucide-react"
import type { AccessContext } from "@magic-admin-v2/runtime/types"
import {
	RouteGroup,
	type RouteGroupId,
	RouteName,
	RouteSection,
	type RouteSectionId,
} from "@magic-admin-v2/constants/routes"
import type { Route } from "@magic-admin-v2/routes/types"

export type NavigationItem = {
	titleKey: string
	href: string
	icon: LucideIcon
}

export type NavigationGroup = {
	id: RouteGroupId
	titleKey: string
	icon: LucideIcon
	href?: string
	items: NavigationItem[]
}

export type PrimaryNavigationItem = {
	id: RouteSectionId
	titleKey: string
	href: string
	icon: LucideIcon
	groups: NavigationGroup[]
}

export type NavigationMatch = {
	section: PrimaryNavigationItem
	group: NavigationGroup
	item?: NavigationItem
}

type MenuCatalogItem = {
	titleKey: string
	icon: LucideIcon
	linkOnly?: boolean
}

const sectionCatalog: Partial<Record<RouteSectionId, MenuCatalogItem>> = {
	[RouteSection.Platform]: { titleKey: "nav.primary.platform", icon: AppWindow },
	[RouteSection.AiGovernance]: { titleKey: "nav.primary.aiGovernance", icon: Shield },
	[RouteSection.EnterpriseManagement]: {
		titleKey: "nav.primary.enterpriseManagement",
		icon: Building2,
	},
	[RouteSection.OfficeSuite]: { titleKey: "nav.primary.officeSuite", icon: Workflow },
	[RouteSection.DataSecurity]: { titleKey: "nav.primary.dataSecurity", icon: Database },
	[RouteSection.Examples]: { titleKey: "nav.primary.examples", icon: RouteIcon },
}

const groupCatalog: Partial<Record<RouteGroupId, MenuCatalogItem>> = {
	[RouteGroup.BasicSettings]: { titleKey: "nav.group.basicSettings", icon: SlidersHorizontal },
	[RouteGroup.OperationsSettings]: {
		titleKey: "nav.group.operationsSettings",
		icon: MonitorCog,
	},
	[RouteGroup.PackageManagement]: { titleKey: "nav.group.packageManagement", icon: Package },
	[RouteGroup.TenantManagement]: { titleKey: "nav.group.tenantManagement", icon: LandPlot },
	[RouteGroup.AgentManagement]: { titleKey: "nav.group.agentManagement", icon: Bot },
	[RouteGroup.ModelManagement]: { titleKey: "nav.group.modelManagement", icon: BrainCircuit },
	[RouteGroup.CustomModels]: { titleKey: "nav.group.customModels", icon: Sparkles },
	[RouteGroup.GovernancePolicies]: { titleKey: "nav.group.governancePolicies", icon: Sliders },
	[RouteGroup.PublishReview]: { titleKey: "nav.group.publishAndReview", icon: FileCheck2 },
	[RouteGroup.ApplicationManagement]: {
		titleKey: "nav.group.applicationManagement",
		icon: LayoutGrid,
	},
	[RouteGroup.EnterpriseInfo]: {
		titleKey: "nav.group.enterpriseInfo",
		icon: Building2,
		linkOnly: true,
	},
	[RouteGroup.ResourceAlerts]: {
		titleKey: "nav.item.resourceAlerts",
		icon: BellRing,
		linkOnly: true,
	},
	[RouteGroup.OrganizationStructure]: {
		titleKey: "nav.group.organizationStructure",
		icon: Network,
	},
	[RouteGroup.IamAccess]: { titleKey: "nav.item.iamAccess", icon: ScanFace, linkOnly: true },
	[RouteGroup.PersonnelHandover]: {
		titleKey: "nav.item.personnelHandover",
		icon: ArrowRightLeft,
		linkOnly: true,
	},
	[RouteGroup.OaApproval]: { titleKey: "nav.group.oaApproval", icon: FileSignature },
	[RouteGroup.DataDashboard]: { titleKey: "nav.group.dataDashboard", icon: LayoutDashboard },
	// 原型中的“日志与分析”使用柱状图标，不使用 Activity 心电图图标。
	[RouteGroup.LogsAnalytics]: { titleKey: "nav.group.logsAnalytics", icon: BarChart3 },
	[RouteGroup.SecurityPermissions]: {
		titleKey: "nav.group.securityPermissions",
		icon: ShieldCheck,
	},
	[RouteGroup.ExampleDashboard]: { titleKey: "nav.group.exampleDashboard", icon: GaugeCircle },
	[RouteGroup.ExampleData]: { titleKey: "nav.group.exampleData", icon: Database },
	[RouteGroup.ExampleForms]: { titleKey: "nav.group.exampleForms", icon: ClipboardList },
	[RouteGroup.ExampleSettings]: {
		titleKey: "nav.group.exampleSettings",
		icon: SlidersHorizontal,
	},
	[RouteGroup.ExampleDetails]: { titleKey: "nav.group.exampleDetails", icon: FileText },
	[RouteGroup.ExampleStates]: { titleKey: "nav.group.exampleStates", icon: Activity },
}

const routeIcons: Record<string, LucideIcon> = {
	[RouteName.PlatformInfo]: Info,
	[RouteName.PlatformAppMenu]: MenuSquare,
	[RouteName.PlatformAiUsage]: LineChart,
	[RouteName.PlatformAiContentReview]: ShieldAlert,
	[RouteName.PlatformAiWatermark]: FingerprintPattern,
	[RouteName.PlatformCustomProviderLicense]: BadgeCheck,
	[RouteName.PlatformProxyServer]: ServerCog,
	[RouteName.PlatformMaintenance]: Wrench,
	[RouteName.PlatformResourceAlerts]: BellRing,
	[RouteName.PlatformPackageList]: PackageCheck,
	[RouteName.PlatformOrderList]: ReceiptText,
	[RouteName.PlatformInvoiceList]: FileText,
	[RouteName.PlatformTenantList]: Landmark,
	[RouteName.PlatformTenantCredits]: Coins,
	[RouteName.PlatformModelList]: Boxes,
	[RouteName.PlatformProviderList]: Cable,
	[RouteName.PlatformSystemCapabilities]: Cpu,
	[RouteName.PlatformSlidesTemplate]: Presentation,
	[RouteName.PlatformOfficialStaff]: UserRoundCheck,
	[RouteName.PlatformOfficialMarketplace]: Store,
	[RouteName.PlatformPublishReview]: ListChecks,
	[RouteName.CustomModelList]: Blocks,
	[RouteName.CustomModelProviders]: Plug,
	[RouteName.ModelGovernance]: GaugeCircle,
	[RouteName.UsageGovernance]: Gauge,
	[RouteName.AiPermissionSettings]: KeyRound,
	[RouteName.OrganizationAppMenu]: LayoutList,
	[RouteName.InternalPublishReview]: FileSearch,
	[RouteName.EnterpriseInfo]: Building2,
	[RouteName.OrganizationDepartment]: Users,
	[RouteName.OrganizationGroup]: UsersRound,
	[RouteName.OrganizationPartners]: Handshake,
	[RouteName.IamDataSource]: Network,
	[RouteName.PersonnelHandover]: ArrowRightLeft,
	[RouteName.ApprovalManage]: ClipboardCheck,
	[RouteName.ApprovalDataView]: ClipboardList,
	[RouteName.ApprovalWorkflowHandover]: Workflow,
	[RouteName.ApprovalTemplateHandover]: FileClock,
	[RouteName.ApprovalLimitedTime]: Hourglass,
	[RouteName.ModelMonitoring]: Activity,
	[RouteName.ModelAuditLog]: ScrollText,
	[RouteName.AdminLogs]: History,
	[RouteName.MemberAnalysis]: PieChart,
	[RouteName.OrganizationAnalysis]: Building,
	[RouteName.DigitalEmployeeAnalysis]: Contact,
	[RouteName.ConsumptionAnalysis]: Wallet,
	[RouteName.TopicAnalysis]: MessageSquareText,
	[RouteName.FileProductionAnalysis]: FileOutput,
	[RouteName.DataDictionary]: BookOpen,
	[RouteName.EnterpriseAdmins]: IdCard,
	[RouteName.SubAdmins]: UserCog,
}

const sectionOrder: readonly RouteSectionId[] = [
	RouteSection.Platform,
	RouteSection.AiGovernance,
	RouteSection.EnterpriseManagement,
	RouteSection.OfficeSuite,
	RouteSection.DataSecurity,
	RouteSection.Examples,
]

const groupOrder: readonly RouteGroupId[] = [
	RouteGroup.BasicSettings,
	RouteGroup.OperationsSettings,
	RouteGroup.PackageManagement,
	RouteGroup.TenantManagement,
	RouteGroup.AgentManagement,
	RouteGroup.ModelManagement,
	RouteGroup.CustomModels,
	RouteGroup.GovernancePolicies,
	RouteGroup.PublishReview,
	RouteGroup.ApplicationManagement,
	RouteGroup.EnterpriseInfo,
	RouteGroup.ResourceAlerts,
	RouteGroup.OrganizationStructure,
	RouteGroup.IamAccess,
	RouteGroup.PersonnelHandover,
	RouteGroup.OaApproval,
	RouteGroup.DataDashboard,
	RouteGroup.LogsAnalytics,
	RouteGroup.SecurityPermissions,
	RouteGroup.ExampleDashboard,
	RouteGroup.ExampleData,
	RouteGroup.ExampleForms,
	RouteGroup.ExampleSettings,
	RouteGroup.ExampleDetails,
	RouteGroup.ExampleStates,
]

/**
 * 菜单项顺序以原型为基准，避免基础路由与企业路由的注册顺序影响最终侧边栏。
 */
const routeOrder: readonly string[] = [
	RouteName.PlatformInfo,
	RouteName.PlatformAppMenu,
	RouteName.PlatformAiContentReview,
	RouteName.PlatformAiWatermark,
	RouteName.PlatformCustomProviderLicense,
	RouteName.PlatformProxyServer,
	RouteName.PlatformMaintenance,
	RouteName.PlatformResourceAlerts,
	RouteName.PlatformPackageList,
	RouteName.PlatformOrderList,
	RouteName.PlatformInvoiceList,
	RouteName.PlatformTenantList,
	RouteName.PlatformTenantCredits,
	RouteName.PlatformSystemCapabilities,
	RouteName.PlatformOfficialStaff,
	RouteName.PlatformOfficialMarketplace,
	RouteName.PlatformPublishReview,
	RouteName.PlatformSlidesTemplate,
	RouteName.PlatformModelList,
	RouteName.PlatformProviderList,
	RouteName.CustomModelList,
	RouteName.CustomModelProviders,
	RouteName.ModelGovernance,
	RouteName.UsageGovernance,
	RouteName.AiPermissionSettings,
	RouteName.InternalPublishReview,
	RouteName.OrganizationAppMenu,
	RouteName.EnterpriseInfo,
	RouteName.OrganizationDepartment,
	RouteName.OrganizationGroup,
	RouteName.OrganizationPartners,
	RouteName.IamDataSource,
	RouteName.PersonnelHandover,
	RouteName.ApprovalManage,
	RouteName.ApprovalDataView,
	RouteName.ApprovalWorkflowHandover,
	RouteName.ApprovalTemplateHandover,
	RouteName.ApprovalLimitedTime,
	RouteName.MemberAnalysis,
	RouteName.OrganizationAnalysis,
	RouteName.DigitalEmployeeAnalysis,
	RouteName.ConsumptionAnalysis,
	RouteName.TopicAnalysis,
	RouteName.FileProductionAnalysis,
	RouteName.DataDictionary,
	RouteName.PlatformAiUsage,
	RouteName.ModelMonitoring,
	RouteName.ModelAuditLog,
	RouteName.AdminLogs,
	RouteName.EnterpriseAdmins,
	RouteName.SubAdmins,
	RouteName.ExamplesDashboard,
	RouteName.ExamplesList,
	RouteName.ExamplesCards,
	RouteName.ExamplesFormSingle,
	RouteName.ExamplesFormMulti,
	RouteName.ExamplesWizard,
	RouteName.ExamplesDialog,
	RouteName.ExamplesSettings,
	RouteName.ExamplesDetail,
	RouteName.ExamplesDetailEdit,
	RouteName.ExamplesSheet,
	RouteName.ExamplesEmpty,
]

const sectionOrderIndex = createOrderIndex(sectionOrder)
const groupOrderIndex = createOrderIndex(groupOrder)
const routeOrderIndex = createOrderIndex(routeOrder)

/**
 * Route metadata is the single source of menu membership. The explicit order
 * catalogs keep the sidebar aligned with the prototype across route bundles.
 */
export function createNavigation(
	routes: readonly Route[],
	access: AccessContext | null,
	basePath = "",
): PrimaryNavigationItem[] {
	if (!access) return []

	const sections: PrimaryNavigationItem[] = []
	const sectionMap = new Map<RouteSectionId, PrimaryNavigationItem>()
	const groupMap = new Map<string, NavigationGroup>()
	const orderedRoutes = flattenRoutes(routes).sort(compareNavigationRoutes)

	for (const route of orderedRoutes) {
		const sectionId = route.meta?.section
		const groupId = route.meta?.group
		if (!route.path || !route.titleKey || !sectionId || !groupId) continue
		if (route.validate && !route.validate(access)) continue
		if (!isMenuVisible(route, access)) continue

		const sectionDefinition = sectionCatalog[sectionId]
		const groupDefinition = groupCatalog[groupId]
		if (!sectionDefinition || !groupDefinition) continue

		const href = joinRoutePath(basePath, route.path)
		let section = sectionMap.get(sectionId)
		if (!section) {
			section = {
				id: sectionId,
				titleKey: sectionDefinition.titleKey,
				icon: sectionDefinition.icon,
				href,
				groups: [],
			}
			sectionMap.set(sectionId, section)
			sections.push(section)
		}

		const scopedGroupId = `${sectionId}:${groupId}`
		let group = groupMap.get(scopedGroupId)
		if (!group) {
			group = {
				id: groupId,
				titleKey: groupDefinition.titleKey,
				icon: groupDefinition.icon,
				href: groupDefinition.linkOnly ? href : undefined,
				items: [],
			}
			groupMap.set(scopedGroupId, group)
			section.groups.push(group)
		}

		if (!groupDefinition.linkOnly) {
			group.items.push({
				titleKey: route.titleKey,
				href,
				icon: routeIcons[route.name] ?? FileText,
			})
		}
	}

	return sections
}

export function getDefaultNavigationHref(
	navigation: readonly PrimaryNavigationItem[],
): string | undefined {
	return navigation[0]?.href
}

function createOrderIndex<TItem>(items: readonly TItem[]) {
	return new Map(items.map((item, index) => [item, index]))
}

function compareNavigationRoutes(left: Route, right: Route) {
	return (
		getOrder(sectionOrderIndex, left.meta?.section) -
			getOrder(sectionOrderIndex, right.meta?.section) ||
		getOrder(groupOrderIndex, left.meta?.group) -
			getOrder(groupOrderIndex, right.meta?.group) ||
		getOrder(routeOrderIndex, left.name) - getOrder(routeOrderIndex, right.name)
	)
}

function getOrder<TItem>(orderIndex: ReadonlyMap<TItem, number>, item: TItem | undefined) {
	if (item === undefined) return Number.MAX_SAFE_INTEGER
	return orderIndex.get(item) ?? Number.MAX_SAFE_INTEGER
}

function joinRoutePath(basePath: string, routePath: string) {
	const normalizedBasePath = basePath === "/" ? "" : basePath.replace(/\/$/, "")
	return `${normalizedBasePath}/${routePath}`
}

export function getNavigationMatch(
	navigation: readonly PrimaryNavigationItem[],
	pathname: string,
): NavigationMatch | undefined {
	for (const section of navigation) {
		for (const group of section.groups) {
			const item = group.items.find((candidate) => candidate.href === pathname)
			if (item || group.href === pathname) return { section, group, item }
		}
	}
	return undefined
}

function flattenRoutes(routes: readonly Route[]): Route[] {
	return routes.flatMap((route) => [
		route,
		...(route.children ? flattenRoutes(route.children) : []),
	])
}

function isMenuVisible(route: Route, access: AccessContext) {
	const menuVisible = route.meta?.menuVisible
	if (typeof menuVisible === "function") return menuVisible(access)
	return menuVisible !== false
}
