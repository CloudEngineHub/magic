/**
 * 路由名称常量。
 *
 * 用于路由定义、菜单元数据和导航判断，避免在业务代码中直接书写 route name 字符串。
 */
export const RouteName = {
	/* ---------- 通用路由 ---------- */

	/** 应用根路由。 */
	Root: "root",
	/** 应用默认索引路由。 */
	Index: "index",
	/** 管理后台概览。 */
	Overview: "overview",
	/** 无权限提示页。 */
	Forbidden: "forbidden",
	/** 404 兜底页。 */
	NotFound: "not-found",

	/* ---------- 平台管理 ---------- */

	/** 平台信息。 */
	PlatformInfo: "platform-info",
	/** 平台应用菜单。 */
	PlatformAppMenu: "platform-app-menu",
	/** AI 水印配置。 */
	PlatformAiWatermark: "platform-ai-watermark",
	/** 自定义服务商许可。 */
	PlatformCustomProviderLicense: "platform-custom-provider-license",
	/** 平台维护。 */
	PlatformMaintenance: "platform-maintenance",
	PlatformResourceAlerts: "platform-resource-alerts",
	/** 套餐列表。 */
	PlatformPackageList: "platform-package-list",
	/** 套餐详情。 */
	PlatformPackageDetail: "platform-package-detail",
	/** 订单列表。 */
	PlatformOrderList: "platform-order-list",
	/** 发票申请管理。 */
	PlatformInvoiceList: "platform-invoice-list",
	/** 平台模型列表。 */
	PlatformModelList: "platform-model-list",
	/** 平台模型服务商列表。 */
	PlatformProviderList: "platform-provider-list",
	/** 系统能力管理。 */
	PlatformSystemCapabilities: "platform-system-capabilities",
	/** PPT 模板管理。 */
	PlatformSlidesTemplate: "platform-slides-template",
	/** 官方员工管理。 */
	PlatformOfficialStaff: "platform-official-staff",
	/** 官方员工市场。 */
	PlatformOfficialMarketplace: "platform-official-marketplace",
	/** 平台发布审核。 */
	PlatformPublishReview: "platform-publish-review",
	/** AI 用量分析。 */
	PlatformAiUsage: "platform-ai-usage",
	/** AI 内容审核。 */
	PlatformAiContentReview: "platform-ai-content-review",
	/** 代理服务器。 */
	PlatformProxyServer: "platform-proxy-server",
	/** 租户列表。 */
	PlatformTenantList: "platform-tenant-list",
	/** 租户积分。 */
	PlatformTenantCredits: "platform-tenant-credits",

	/* ---------- AI 管理 ---------- */

	/** 内部员工和技能发布审核。 */
	InternalPublishReview: "internal-publish-review",
	/** 自定义模型列表。 */
	CustomModelList: "custom-model-list",
	/** 自定义模型服务商。 */
	CustomModelProviders: "custom-model-providers",
	/** 模型管控策略。 */
	ModelGovernance: "model-governance",
	/** 用量管控策略。 */
	UsageGovernance: "usage-governance",
	/** AI 功能权限设置。 */
	AiPermissionSettings: "ai-permission-settings",
	/** 组织应用菜单。 */
	OrganizationAppMenu: "organization-app-menu",

	/* ---------- 企业管理 ---------- */

	/** 企业基本信息。 */
	EnterpriseInfo: "enterprise-info",
	/** 组织架构-部门。 */
	OrganizationDepartment: "organization-department",
	/** 组织架构-用户组。 */
	OrganizationGroup: "organization-group",
	/** 组织架构-合作伙伴。 */
	OrganizationPartners: "organization-partners",
	/** IAM 数据源列表。 */
	IamDataSource: "iam-data-source",
	/** IAM 数据源配置。 */
	IamDataSourceConfig: "iam-data-source-config",

	/* ---------- 办公套件：OA 审批 ---------- */

	/** 审批模板管理。 */
	ApprovalManage: "approval-manage",
	/** 审批模板设计。 */
	ApprovalDesign: "approval-design",
	/** 审批模板多语言设置。 */
	ApprovalTemplateMultiLang: "approval-template-multilang",
	/** 审批数据管理。 */
	ApprovalDataView: "approval-data-view",
	/** 审批流程交接。 */
	ApprovalWorkflowHandover: "approval-workflow-handover",
	/** 审批模板交接。 */
	ApprovalTemplateHandover: "approval-template-handover",
	/** 限时审批设置。 */
	ApprovalLimitedTime: "approval-limited-time",

	/* ---------- 数据安全 ---------- */

	/** 模型调用监控。 */
	ModelMonitoring: "model-monitoring",
	/** 模型审计日志。 */
	ModelAuditLog: "model-audit-log",
	/** 管理员操作日志。 */
	AdminLogs: "admin-logs",
	/** 企业管理员。 */
	EnterpriseAdmins: "enterprise-admins",
	/** 子管理员。 */
	SubAdmins: "sub-admins",
	/** 成员分析。 */
	MemberAnalysis: "member-analysis",
	/** 组织分析。 */
	OrganizationAnalysis: "organization-analysis",
	/** 数字员工分析。 */
	DigitalEmployeeAnalysis: "digital-employee-analysis",
	/** 消耗分析。 */
	ConsumptionAnalysis: "consumption-analysis",
	/** 话题分析。 */
	TopicAnalysis: "topic-analysis",
	/** 文件产出情况分析。 */
	FileProductionAnalysis: "file-production-analysis",
	/** 数据字典。 */
	DataDictionary: "data-dictionary",

	/* ---------- 兼容跳转和索引路由 ---------- */

	/** 企业信息索引路由。 */
	EnterpriseInfoIndex: "enterprise-info-index",
	/** 组织架构索引路由。 */
	EnterpriseOrganizationIndex: "enterprise-organization-index",

	/* ---------- 开发示例 ---------- */

	/** 示例仪表盘。 */
	ExamplesDashboard: "examples-dashboard",
	/** 示例列表。 */
	ExamplesList: "examples-list",
	/** 示例卡片。 */
	ExamplesCards: "examples-cards",
	/** 示例表单。 */
	ExamplesForm: "examples-form",
	/** 示例单列表单。 */
	ExamplesFormSingle: "examples-form-single",
	/** 示例多列表单。 */
	ExamplesFormMulti: "examples-form-multi",
	/** 示例设置页。 */
	ExamplesSettings: "examples-settings",
	/** 示例详情页。 */
	ExamplesDetail: "examples-detail",
	/** 示例详情编辑页。 */
	ExamplesDetailEdit: "examples-detail-edit",
	/** 示例空状态页。 */
	ExamplesEmpty: "examples-empty",
	/** 示例分步表单。 */
	ExamplesWizard: "examples-wizard",
	/** 示例弹窗表单。 */
	ExamplesDialog: "examples-dialog",
	/** 示例抽屉详情。 */
	ExamplesSheet: "examples-sheet",
	/** 组织概览示例。 */
	OrganizationOverviewExample: "organization-overview-example",
	/** 人事交接示例。 */
	PersonnelHandover: "personnel-handover",
} as const satisfies Record<string, string>

/** 路由所属的一级菜单分区。 */
export const RouteSection = {
	/** 概览入口；不进入常规侧边栏分组。 */
	Overview: "overview",
	/** 平台管理。 */
	Platform: "platform",
	/** AI 管理。 */
	AiGovernance: "ai-governance",
	/** 企业管理。 */
	EnterpriseManagement: "enterprise-management",
	/** 办公套件。 */
	OfficeSuite: "office-suite",
	/** 数据安全。 */
	DataSecurity: "data-security",
	/** 开发示例。 */
	Examples: "examples",
} as const satisfies Record<string, string>

/** 路由所属的二级菜单分组。 */
export const RouteGroup = {
	/* ---------- 通用路由 ---------- */

	/** 概览入口；不进入常规侧边栏分组。 */
	Overview: "overview",

	/* ---------- 平台管理 ---------- */

	/** 基础设置。 */
	BasicSettings: "basic-settings",
	/** 运营设置。 */
	OperationsSettings: "operations-settings",
	/** 套餐管理。 */
	PackageManagement: "package-management",
	/** 租户管理。 */
	TenantManagement: "tenant-management",
	/** 智能体管理。 */
	AgentManagement: "agent-management",
	/** 模型管理。 */
	ModelManagement: "model-management",

	/* ---------- AI 管理 ---------- */

	/** 自定义大模型。 */
	CustomModels: "custom-models",
	/** 管控策略。 */
	GovernancePolicies: "governance-policies",
	/** 发布与审核。 */
	PublishReview: "publish-review",
	/** 应用管理。 */
	ApplicationManagement: "application-management",

	/* ---------- 企业管理 ---------- */

	/** 企业信息。 */
	EnterpriseInfo: "enterprise-info",
	/** 积分预警。 */
	ResourceAlerts: "resource-alerts",
	/** 组织架构。 */
	OrganizationStructure: "organization-structure",
	/** IAM 接入。 */
	IamAccess: "iam-access",
	/** 人员交接。 */
	PersonnelHandover: "personnel-handover",

	/* ---------- 办公套件 ---------- */

	/** OA 审批。 */
	OaApproval: "oa-approval",

	/* ---------- 数据安全 ---------- */

	/** 数据看板。 */
	DataDashboard: "data-dashboard",
	/** 日志及分析。 */
	LogsAnalytics: "logs-analytics",
	/** 管理权限。 */
	SecurityPermissions: "security-permissions",

	/* ---------- 开发示例 ---------- */

	/** 示例仪表盘。 */
	ExampleDashboard: "example-dashboard",
	/** 数据展示示例。 */
	ExampleData: "example-data",
	/** 表单流程示例。 */
	ExampleForms: "example-forms",
	/** 设置页面示例。 */
	ExampleSettings: "example-settings",
	/** 详情展示示例。 */
	ExampleDetails: "example-details",
	/** 状态反馈示例。 */
	ExampleStates: "example-states",
} as const satisfies Record<string, string>

/** 一级菜单分区 ID。 */
export type RouteSectionId = (typeof RouteSection)[keyof typeof RouteSection]

/** 二级菜单分组 ID。 */
export type RouteGroupId = (typeof RouteGroup)[keyof typeof RouteGroup]

/**
 * 路由 path 常量。
 *
 * 值均为 React Router 路由定义使用的相对路径；重定向目标和绝对链接分别定义在下方。
 */
export const RoutePath = {
	/* ---------- 通用路由 ---------- */

	/** 管理后台概览。 */
	Overview: "overview",
	/** 无权限提示页。 */
	Forbidden: "403",
	/** 404 兜底匹配。 */
	NotFound: "*",

	/* ---------- 平台管理 ---------- */

	/** 平台信息。 */
	PlatformInfo: "platform/basic/platform-info",
	/** 平台应用菜单。 */
	PlatformAppMenu: "platform/operations/app-menu",
	/** AI 水印配置。 */
	PlatformAiWatermark: "platform/operations/ai-watermark",
	/** 自定义服务商许可。 */
	PlatformCustomProviderLicense: "platform/operations/custom-service-provider-license",
	/** 平台维护。 */
	PlatformMaintenance: "platform/operations/maintenance",
	PlatformResourceAlerts: "platform/operations/resource-alerts",
	/** 套餐列表。 */
	PlatformPackageList: "platform/packages/package-list",
	/** 套餐详情。 */
	PlatformPackageDetail: "platform/packages/package-detail",
	/** 订单列表。 */
	PlatformOrderList: "platform/packages/order-list",
	/** 发票申请管理。 */
	PlatformInvoiceList: "platform/packages/invoice-list",
	/** 平台模型列表。 */
	PlatformModelList: "platform/models/model-list",
	/** 平台模型服务商列表。 */
	PlatformProviderList: "platform/models/provider-list",
	/** 系统能力管理。 */
	PlatformSystemCapabilities: "platform/agents/system-capabilities",
	/** PPT 模板管理。 */
	PlatformSlidesTemplate: "platform/agents/slides-template",
	/** 官方员工管理。 */
	PlatformOfficialStaff: "platform/agents/official-staff",
	/** 官方员工市场。 */
	PlatformOfficialMarketplace: "platform/agents/official-marketplace",
	/** 平台发布审核。 */
	PlatformPublishReview: "platform/agents/publish-review",
	/** AI 用量分析。 */
	PlatformAiUsage: "platform/dashboard/ai-usage",
	/** AI 内容审核。 */
	PlatformAiContentReview: "platform/operations/ai-content-review",
	/** 代理服务器。 */
	PlatformProxyServer: "platform/operations/proxy-server",
	/** 租户列表。 */
	PlatformTenantList: "platform/tenants/tenant-list",
	/** 租户积分。 */
	PlatformTenantCredits: "platform/tenants/tenant-credits",

	/* ---------- AI 管理 ---------- */

	/** 内部员工和技能发布审核。 */
	InternalPublishReview: "ai-governance/reviews/internal-publish",
	/** 自定义模型列表。 */
	CustomModelList: "ai-governance/custom-models/model-list",
	/** 自定义模型服务商。 */
	CustomModelProviders: "ai-governance/custom-models/provider-list",
	/** 模型管控策略。 */
	ModelGovernance: "ai-governance/policies/model-governance",
	/** 用量管控策略。 */
	UsageGovernance: "ai-governance/policies/usage-governance",
	/** AI 功能权限设置。 */
	AiPermissionSettings: "ai-governance/policies/ai-permissions",
	/** 组织应用菜单。 */
	OrganizationAppMenu: "ai-governance/applications/app-menu",

	/* ---------- 企业管理 ---------- */

	/** 企业基本信息。 */
	EnterpriseInfo: "enterprise/info/basic",
	/** 组织架构-部门。 */
	OrganizationDepartment: "enterprise/organization/department",
	/** 组织架构-用户组。 */
	OrganizationGroup: "enterprise/organization/group",
	/** 组织架构-合作伙伴。 */
	OrganizationPartners: "enterprise/organization/partners",
	/** IAM 数据源列表。 */
	IamDataSource: "enterprise/iam/data-source",
	/** IAM 数据源配置，sourceType 为数据源类型参数。 */
	IamDataSourceConfig: "enterprise/iam/data-source/:sourceType",

	/* ---------- 办公套件：OA 审批 ---------- */

	/** 审批模板管理。 */
	ApprovalManage: "office-suite/oa-approval/approval-list",
	/** 审批模板设计。 */
	ApprovalDesign: "office-suite/oa-approval/approval-list/design",
	/** 审批模板多语言设置。 */
	ApprovalTemplateMultiLang: "office-suite/oa-approval/approval-list/multilang",
	/** 审批数据管理。 */
	ApprovalDataView: "office-suite/oa-approval/data-view",
	/** 审批流程交接。 */
	ApprovalWorkflowHandover: "office-suite/oa-approval/process-handover",
	/** 审批模板交接。 */
	ApprovalTemplateHandover: "office-suite/oa-approval/template-handover",
	/** 限时审批设置。 */
	ApprovalLimitedTime: "office-suite/oa-approval/limited-time",

	/* ---------- 数据安全 ---------- */

	/** 模型调用监控。 */
	ModelMonitoring: "data-security/analytics/model-monitoring",
	/** 模型审计日志。 */
	ModelAuditLog: "data-security/analytics/model-audit-log",
	/** 管理员操作日志。 */
	AdminLogs: "data-security/analytics/admin-logs",
	/** 企业管理员。 */
	EnterpriseAdmins: "data-security/security/enterprise-admins",
	/** 子管理员。 */
	SubAdmins: "data-security/security/sub-admins",
	/** 成员分析。 */
	MemberAnalysis: "data-security/data-dashboard/member-analysis",
	/** 组织分析。 */
	OrganizationAnalysis: "data-security/data-dashboard/organization-analysis",
	/** 数字员工分析。 */
	DigitalEmployeeAnalysis: "data-security/data-dashboard/digital-employee-analysis",
	/** 消耗分析。 */
	ConsumptionAnalysis: "data-security/data-dashboard/consumption-analysis",
	/** 话题分析。 */
	TopicAnalysis: "data-security/data-dashboard/topic-analysis",
	/** 文件产出情况分析。 */
	FileProductionAnalysis: "data-security/data-dashboard/file-production-analysis",
	/** 数据字典。 */
	DataDictionary: "data-security/data-dashboard/data-dictionary",

	/* ---------- 兼容跳转和索引路由 ---------- */

	/** 企业信息索引路由。 */
	EnterpriseInfoIndex: "enterprise/info",
	/** 组织架构索引路由。 */
	EnterpriseOrganizationIndex: "enterprise/organization",

	/* ---------- 开发示例 ---------- */

	/** 示例仪表盘。 */
	ExamplesDashboard: "examples/dashboard",
	/** 示例列表。 */
	ExamplesList: "examples/list",
	/** 示例卡片。 */
	ExamplesCards: "examples/cards",
	/** 示例表单。 */
	ExamplesForm: "examples/form",
	/** 示例单列表单。 */
	ExamplesFormSingle: "examples/form-single",
	/** 示例多列表单。 */
	ExamplesFormMulti: "examples/form-multi",
	/** 示例设置页。 */
	ExamplesSettings: "examples/settings",
	/** 示例详情页。 */
	ExamplesDetail: "examples/detail",
	/** 示例详情编辑页。 */
	ExamplesDetailEdit: "examples/detail-edit",
	/** 示例空状态页。 */
	ExamplesEmpty: "examples/empty",
	/** 示例分步表单。 */
	ExamplesWizard: "examples/wizard",
	/** 示例弹窗表单。 */
	ExamplesDialog: "examples/dialog-form",
	/** 示例抽屉详情。 */
	ExamplesSheet: "examples/sheet-detail",
	/** 组织概览示例。 */
	OrganizationOverviewExample: "examples/organization-overview",
	/** 人事交接示例。 */
	PersonnelHandover: "enterprise/personnel-handover",
} as const satisfies Record<string, string>

/** 非路由声明 pattern 使用的相对重定向目标。 */
export const RouteRedirectPath = {
	/** 根路由进入概览页。 */
	Overview: RoutePath.Overview,
	/** 企业信息索引进入基本信息页。 */
	EnterpriseInfoBasic: "basic",
	/** 组织架构索引进入部门页。 */
	EnterpriseOrganizationDepartment: "department",
	/** 示例表单父路由进入单列表单页。 */
	ExamplesFormSingle: "../form-single",
} as const satisfies Record<string, string>

/** 同级页面之间导航时使用的相对路径。 */
export const RouteRelativePath = {
	/** 套餐列表返回地址。 */
	PlatformPackageList: "../package-list",
	/** 套餐详情进入地址。 */
	PlatformPackageDetail: "../package-detail",
	/** 发票详情跳转订单列表地址。 */
	PlatformOrderList: "../order-list",
} as const satisfies Record<string, string>

/** 路由声明外使用的应用内绝对链接。 */
export const RouteHref = {
	/** 管理后台概览绝对链接。 */
	Overview: `/${RoutePath.Overview}`,
} as const satisfies Record<string, string>
