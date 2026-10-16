/**
 * 权限 key 映射。
 *
 * 常量名、字符串值和业务分组与旧版 admin 的 `PERMISSION_KEY_MAP` 保持一致。
 * 此文件只提供完整的权限字典；具体路由是否使用某个权限，仍由新版路由配置决定。
 */
export const PERMISSION_KEY_MAP = {
	/* ---------- Magic 权限组 ---------- */

	/** 平台级权限组：覆盖 platform.*、admin.*、workspace.*。 */
	MAGIC_PLATFORM_PERMISSIONS: "MAGIC_PLATFORM_PERMISSIONS",
	/** 组织管理员权限组：覆盖 admin.*、workspace.*，不包含 platform.*。 */
	MAGIC_ALL_PERMISSIONS: "MAGIC_ALL_PERMISSIONS",
	/** 普通成员权限组：覆盖 workspace.*。 */
	MAGIC_PERSON_PERMISSIONS: "MAGIC_PERSON_PERMISSIONS",

	/* ---------- AI 管理：自定义大模型 ---------- */

	/** 自定义模型管理-查询。 */
	MODEL_MANAGEMENT_QUERY: "workspace.ai.model_management.query",
	/** 自定义模型管理-编辑。 */
	MODEL_MANAGEMENT_EDIT: "workspace.ai.model_management.edit",

	/* ---------- AI 管理：内部员工及技能 ---------- */

	/** 员工发布审核-查询。 */
	AGENT_REVIEW_QUERY: "workspace.ai.agent_management.query",
	/** 员工发布审核-编辑。 */
	AGENT_REVIEW_EDIT: "workspace.ai.agent_management.edit",
	/** 技能发布审核-查询。 */
	SKILL_REVIEW_QUERY: "workspace.ai.skill_management.query",
	/** 技能发布审核-编辑。 */
	SKILL_REVIEW_EDIT: "workspace.ai.skill_management.edit",

	/* ---------- AI 管理：应用菜单 ---------- */

	/** AI 应用菜单-查询。 */
	AI_APP_MENU_QUERY: "admin.ai.application.menu.query",
	/** AI 应用菜单-编辑。 */
	AI_APP_MENU_EDIT: "admin.ai.application.menu.edit",

	/* ---------- 平台管理：平台模型 ---------- */

	/** 平台模型管理-查询。 */
	PLATFORM_MODEL_MANAGEMENT_QUERY: "platform.ai.model_management.query",
	/** 平台模型管理-编辑。 */
	PLATFORM_MODEL_MANAGEMENT_EDIT: "platform.ai.model_management.edit",

	/* ---------- 平台管理：智能体增强 ---------- */

	/** 系统智能体/模式管理/内置员工-查询。 */
	MODE_MANAGEMENT_QUERY: "platform.agent.official.query",
	/** 系统智能体/模式管理/内置员工-编辑。 */
	MODE_MANAGEMENT_EDIT: "platform.agent.official.edit",
	/** 系统技能/能力管理-查询。 */
	AI_ABILITY_MANAGEMENT_QUERY: "platform.ai.ability.query",
	/** 系统技能/能力管理-编辑。 */
	AI_ABILITY_MANAGEMENT_EDIT: "platform.ai.ability.edit",
	/** PPT 模板配置-查询。 */
	SLIDES_TEMPLATE_QUERY: "platform.setting.slides_template.query",
	/** PPT 模板配置-编辑。 */
	SLIDES_TEMPLATE_EDIT: "platform.setting.slides_template.edit",
	/** 平台员工发布审核-查询。 */
	PLATFORM_EMPLOYEE_REVIEW_QUERY: "platform.agent.review.query",
	/** 平台员工发布审核-编辑。 */
	PLATFORM_EMPLOYEE_REVIEW_EDIT: "platform.agent.review.edit",
	/** 平台员工市场-查询。 */
	PLATFORM_EMPLOYEE_MARKET_QUERY: "platform.agent.market.query",
	/** 平台员工市场-编辑。 */
	PLATFORM_EMPLOYEE_MARKET_EDIT: "platform.agent.market.edit",
	/** 平台 Skill 发布审核-查询。 */
	PLATFORM_SKILL_REVIEW_QUERY: "platform.skill.review.query",
	/** 平台 Skill 发布审核-编辑。 */
	PLATFORM_SKILL_REVIEW_EDIT: "platform.skill.review.edit",
	/** 平台 Skill 市场-查询。 */
	PLATFORM_SKILL_MARKET_QUERY: "platform.skill.market.query",
	/** 平台 Skill 市场-编辑。 */
	PLATFORM_SKILL_MARKET_EDIT: "platform.skill.market.edit",

	/* ---------- 平台管理：平台设置 ---------- */

	/** 平台维护-查询。 */
	INFO_MANAGEMENT_QUERY: "platform.setting.maintenance.query",
	/** 平台维护-编辑。 */
	INFO_MANAGEMENT_EDIT: "platform.setting.maintenance.edit",
	/** 平台信息-查询。 */
	PLATFORM_INFO_MANAGEMENT_QUERY: "platform.setting.platform_info.query",
	/** 平台信息-编辑。 */
	PLATFORM_INFO_MANAGEMENT_EDIT: "platform.setting.platform_info.edit",
	/** 平台应用菜单-查询。 */
	APP_MENU_QUERY: "platform.setting.application.query",
	/** 平台应用菜单-编辑。 */
	APP_MENU_EDIT: "platform.setting.application.edit",

	/* ---------- 天书身份权限 ---------- */

	/** 天书全部权限/超级管理员。 */
	TEAMSHARE_ALL_PERMISSIONS: "super_admin",
	/** 组织所有者。 */
	ORGANIZATION_OWNER: "organization_owner",
	/** 子管理员身份。 */
	TEAMSHARE_SUB_ADMIN: "sub_admin",

	/* ---------- 企业管理：OA 审批 ---------- */

	/** OA 审批-管理分组。 */
	APPROVAL_TEMPLATE_CATEGORY_ALL: "TeamshareOS_console_oa_approval_template_category.all",
	/** OA 审批-新建审批模板。 */
	APPROVAL_TEMPLATE_CREATE: "TeamshareOS_console_oa_approval_template.create",
	/** OA 审批-管理全部模板。 */
	APPROVAL_TEMPLATE_ALL: "TeamshareOS_console_oa_approval_template.all",
	/** OA 审批-管理我创建及我可管理的模板。 */
	APPROVAL_TEMPLATE_PART_ALL: "TeamshareOS_console_oa_approval_template_part_manager.all",
	/** OA 审批-数据管理。 */
	APPROVAL_DATA_VIEW: "TeamshareOS_console_approval_instances_manager.all",
	/** OA 审批-流程交接、模板交接和限时审批。 */
	APPROVAL_WORKFLOW_HANDOVER: "TeamshareOS_console_approval_transfers_manager.all",

	/* ---------- 企业管理：组织架构 ---------- */

	/** 查看组织架构。 */
	ORGANIZATION_READ: "TeamshareOS_console_organization.read",
	/** 修改组织架构。 */
	ORGANIZATION_EDIT: "TeamshareOS_console_organization.edit",
	/** 编辑组织信息。 */
	ORGANIZATION_INFO_EDIT: "TeamshareOS_console_organization_info.edit",
	/** 编辑成员信息。 */
	ORGANIZATION_MEMBER_EDIT: "TeamshareOS_console_organization_member.edit",
	/** 查看合作伙伴。 */
	PARTNER_READ: "TeamshareOS_console_partner.read",
	/** 编辑合作伙伴。 */
	PARTNER_EDIT: "TeamshareOS_console_partner.edit",
	/** 用户组管理。 */
	USER_GROUP_ALL: "TeamshareOS_user_group.all",

	/* ---------- 企业管理：组织身份水印 ---------- */

	/**
	 * 组织身份水印的读取与保存（资源 admin.setting.identity_watermark、操作 edit）。
	 * 与旧版 admin 的取值保持一致；后端权限目录尚未下发该 key，
	 * 因此当前由「企业信息」路由权限 + 服务端 42003 共同兜底。
	 */
	IDENTITY_WATERMARK_EDIT: "admin.setting.identity_watermark.edit",

	/* ---------- AI 管理：模型与用量管控 ---------- */

	/** 用量管控策略-查询。 */
	CONTROL_STRATEGY_QUERY: "admin.ai.control_policy.query",
	/** 用量管控策略-编辑。 */
	CONTROL_STRATEGY_EDIT: "admin.ai.control_policy.edit",
	/** 模型角色管控-查询。 */
	MODEL_ACCESS_ROLE_QUERY: "admin.ai.model_access_role.query",
	/** 模型角色管控-编辑。 */
	MODEL_ACCESS_ROLE_EDIT: "admin.ai.model_access_role.edit",

	/* ---------- 组织管理：积分预警 ---------- */

	/** 积分预警-查询。 */
	RESOURCE_ALERT_QUERY: "admin.organization.resource_alert.query",
	/** 积分预警-编辑。 */
	RESOURCE_ALERT_EDIT: "admin.organization.resource_alert.edit",

	/* ---------- AI 管理：审计与统计 ---------- */

	/** 模型审计日志-查询。 */
	MODEL_AUDIT_LOG_QUERY: "workspace.ai.model_audit_log.query",
	/** 模型审计日志-编辑。 */
	MODEL_AUDIT_LOG_EDIT: "workspace.ai.model_audit_log.edit",
	/** 模型审计统计-查询。 */
	MODEL_STATISTICS_QUERY: "workspace.ai.model_audit_statistics.query",
	/** 模型审计统计-编辑。 */
	MODEL_STATISTICS_EDIT: "workspace.ai.model_audit_statistics.edit",

	/* ---------- 数据与安全：数据看板 ---------- */

	/** 成员分析-查询。 */
	DATA_DASHBOARD_MEMBER_QUERY: "admin.data_dashboard.member.query",
	/** 组织分析-查询。 */
	DATA_DASHBOARD_ORGANIZATION_QUERY: "admin.data_dashboard.organization.query",
	/** 数字员工分析-查询。 */
	DATA_DASHBOARD_AGENT_QUERY: "admin.data_dashboard.agent.query",
	/** 消耗分析-查询。 */
	DATA_DASHBOARD_CONSUMPTION_QUERY: "admin.data_dashboard.consumption.query",
	/** 话题分析-查询。 */
	DATA_DASHBOARD_TOPIC_QUERY: "admin.data_dashboard.topic.query",
	/** 文件产出分析-查询。 */
	DATA_DASHBOARD_FILE_QUERY: "admin.data_dashboard.file.query",

	/* ---------- 平台管理：套餐与订单 ---------- */

	/** 套餐管理-查询。 */
	PACKAGE_MANAGEMENT_QUERY: "platform.product.manage.query",
	/** 套餐管理-编辑。 */
	PACKAGE_MANAGEMENT_EDIT: "platform.product.manage.edit",
	/** 订单管理-查询。 */
	ORDER_MANAGEMENT_QUERY: "platform.product.order.query",
	/** 发票管理-查询。 */
	INVOICE_MANAGEMENT_QUERY: "platform.product.invoice.query",
	/** 发票管理-编辑。 */
	INVOICE_MANAGEMENT_EDIT: "platform.product.invoice.edit",

	/* ---------- 平台管理：模型审计 ---------- */

	/** 平台模型审计日志-查询。 */
	SAFE_MODEL_AUDIT_LOG_QUERY: "platform.ai.model_audit_log.query",
	/** 平台模型审计日志-编辑。 */
	SAFE_MODEL_AUDIT_LOG_EDIT: "platform.ai.model_audit_log.edit",
	/** 平台模型审计统计-查询。 */
	SAFE_MODEL_STATISTICS_QUERY: "platform.ai.model_audit_statistics.query",
	/** 平台模型审计统计-编辑。 */
	SAFE_MODEL_STATISTICS_EDIT: "platform.ai.model_audit_statistics.edit",

	/* ---------- 平台管理：代理服务器与 AI 审查 ---------- */

	/** 代理服务器-查询。 */
	PROXY_SERVER_QUERY: "platform.setting.proxy_server.query",
	/** 代理服务器-编辑。 */
	PROXY_SERVER_EDIT: "platform.setting.proxy_server.edit",
	/** AI 内容审查列表-查询。 */
	AIAUDIT_QUERY: "platform.ai.content_audit.list",
	/** AI 内容审查-查看详情。 */
	AIAUDIT_DETAIL: "platform.ai.content_audit.detail",
	/** AI 内容审查-标记风险。 */
	AIAUDIT_MARK_RISK: "platform.ai.content_audit.risk",

	/* ---------- 平台管理：租户 ---------- */

	/** 租户列表-查询。 */
	ORIENTATION_LIST_QUERY: "platform.organization.list.query",
	/** 租户列表-编辑。 */
	ORIENTATION_LIST_EDIT: "platform.organization.list.edit",
	/** 租户积分-查询列表。 */
	ORIENTATION_POINTS_LIST: "platform.organization.point_manager.list",
	/** 租户积分-查看详情。 */
	ORIENTATION_POINTS_DETAIL: "platform.organization.point_manager.detail",
	/** 租户积分-添加积分。 */
	ORIENTATION_POINTS_ADD_POINTS: "platform.organization.point_manager.add_points",
	/** 租户积分-绑定套餐。 */
	ORIENTATION_POINTS_BIND_PACKAGE: "platform.organization.point_manager.bind_package",

	/* ---------- 企业管理：安全管控 ---------- */

	/** 组织管理员-查询。 */
	ADMIN_USER_QUERY: "admin.safe.admin.query",
	/** 组织管理员-编辑。 */
	ADMIN_USER_EDIT: "admin.safe.admin.edit",
	/** 子管理员-查询。 */
	SUB_ADMIN_QUERY: "admin.safe.sub_admin.query",
	/** 子管理员-编辑。 */
	SUB_ADMIN_EDIT: "admin.safe.sub_admin.edit",
	/** 管理员操作日志-查询。 */
	ADMIN_OPERATION_LOGS_QUERY: "admin.safe.operation_log.query",
	/** 管理员操作日志-编辑。 */
	ADMIN_OPERATION_LOGS_EDIT: "admin.safe.operation_log.edit",
	/** 功能权限-查询。 */
	FUNCTION_PERMISSION_QUERY: "admin.safe.function_permission.query",
	/** 功能权限-编辑。 */
	FUNCTION_PERMISSION_EDIT: "admin.safe.function_permission.edit",
} as const satisfies Record<string, string>

/** 新版路由可引用的完整权限 key 联合类型。 */
export type PermissionKey = (typeof PERMISSION_KEY_MAP)[keyof typeof PERMISSION_KEY_MAP]
