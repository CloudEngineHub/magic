export namespace DataDashboard {
	/** 数字员工来源精确筛选：个人创建 */
	export type LocalCreateSource = "LOCAL_CREATE"
	/** 数字员工来源精确筛选：市场安装或官方内置模式 */
	export type MarketSource = "MARKET"
	/** 数字员工来源精确筛选：组织共享 */
	export type OrganizationSource = "ORGANIZATION"
	/** 数字员工来源筛选枚举；仅数字员工分析页面允许传入 */
	export type AgentSourceType = LocalCreateSource | MarketSource | OrganizationSource

	/** 数字员工 Tabs 类型 */
	export type AgentTabType = "agent_usage" | "agent_call" | "agent_member" | "agent_department"

	/** 成员 Tabs 类型 */
	export type MemberTabType = "member_usage" | "member_call" | "member_agent" | "member_silent"

	/** 数据看板公共查询参数 */
	export interface BaseQuery {
		/** 开始日期，格式 Y-m-d；必须和 end_date 同时传入 */
		start_date?: string
		/** 结束日期，格式 Y-m-d；不得早于 start_date，必须和 start_date 同时传入 */
		end_date?: string
		/** 精确数字员工编码 */
		agent_code?: string
		/** 精确成员 ID */
		user_id?: string
		/** 精确部门节点，不自动包含子部门 */
		department_id?: string
	}

	/** 数字员工 Summary 查询参数 */
	export interface AgentSummaryQuery extends BaseQuery {
		/** 数字员工来源精确筛选；成员页面不得传入 */
		source_type?: AgentSourceType
	}

	/** 数字员工 Tabs 查询参数 */
	export interface AgentTabsQuery extends AgentSummaryQuery {
		/** Tab 类型；默认 agent_usage */
		tab_type?: AgentTabType
		/** 当前页码，最小值 1，默认 1 */
		page?: number
		/** 每页条数，最小值 1，最大值 100，默认 20 */
		page_size?: number
	}

	/** 成员 Summary 查询参数；成员页面不得传入 source_type */
	export interface MemberSummaryQuery extends BaseQuery {
		/** 精确成员 ID */
		user_id?: string
	}

	/** 成员 Tabs 查询参数；成员页面不得传入 source_type */
	export interface MemberTabsQuery extends MemberSummaryQuery {
		/** Tab 类型；默认 member_usage */
		tab_type?: MemberTabType
		/** 当前页码，最小值 1，默认 1 */
		page?: number
		/** 每页条数，最小值 1，最大值 100，默认 20 */
		page_size?: number
	}

	/** 数字员工筛选选项行 */
	export interface AgentOption {
		/** 数字员工稳定编码 */
		agent_code: string
		/** 数字员工展示名称 */
		agent_name: string | null
	}

	/** 数字员工筛选选项响应 */
	export interface AgentOptions {
		/** 当前组织可筛选的数字员工总数 */
		total: number
		/** 数字员工筛选选项列表 */
		list: AgentOption[]
	}

	/** 数字员工趋势点 */
	export interface AgentUsageTrendItem {
		/** task 归属日期，格式 Y-m-d */
		date: string
		/** 当日归属 task 中的去重数字员工数 */
		active_agent_count: number
		/** 当日归属的统一 task 数 */
		call_count: number
	}

	/** 数字员工调用次数精确分布 */
	export interface AgentCallDistributionItem {
		/** 单个数字员工在当前周期内的调用次数 */
		call_count: number
		/** 具有该调用次数的数字员工数 */
		agent_count: number
	}

	/** 数字员工 Summary 响应数据 */
	export interface AgentSummary {
		/** 官方模式与当前组织未删除数字员工总数之和；不受日期和部门筛选影响 */
		agent_total: number
		/** 统计范围内产生过有效调用的去重数字员工数 */
		active_agent_count: number
		/** 统一 task 口径下的调用总数，不是底层积分流水条数 */
		total_call_count: number
		/** 统计范围内的去重调用成员数 */
		member_count: number
		/** 排除空部门后的去重部门数 */
		department_count: number
		/** 统计范围内积分消耗总量 */
		total_points: number
		/** 统计范围内 Token 消耗总量 */
		total_tokens: number
		/** 按统一 task 归属日期聚合的使用趋势 */
		usage_trend: AgentUsageTrendItem[]
		/** 按“单个数字员工周期调用次数”形成的精确分布；前端按产品配置组合展示区间 */
		call_distribution: AgentCallDistributionItem[]
	}

	/** 成员趋势点 */
	export interface MemberUsageTrendItem {
		/** task 归属日期，格式 Y-m-d */
		date: string
		/** 当日归属 task 中的当前在职去重活跃成员数 */
		active_member_count: number
		/** 当日归属的全部统一 task 数，包含已离职成员历史事实 */
		call_count: number
	}

	/** 成员使用天数精确分布 */
	export interface MemberUsageDaysDistributionItem {
		/** 单个成员在统计范围内的去重使用天数 */
		usage_days: number
		/** 具有该使用天数的成员数 */
		member_count: number
	}

	/** 成员 Summary 响应数据 */
	export interface MemberSummary {
		/** 当前组织、当前部门筛选下的当前在职成员数 */
		employed_member_count: number
		/** 当前在职成员中，统计范围内产生过有效调用的去重成员数 */
		active_member_count: number
		/** 统计范围内产生过调用的去重成员数，作为成员人均指标分母 */
		calling_member_count: number
		/** 当前在职成员中，历史首次有效调用日期落在统计范围内的人数 */
		new_member_count: number
		/** 全部统一 task 调用数，保留已离职成员的历史调用 */
		total_call_count: number
		/** 全部统一 task 积分消耗，保留已离职成员历史消耗 */
		total_points: number
		/** 全部统一 task Token 消耗，保留已离职成员历史消耗 */
		total_tokens: number
		/** 按统一 task 归属日期聚合的成员使用趋势 */
		usage_trend: MemberUsageTrendItem[]
		/** 按成员使用天数形成的精确分布；不是成员明细 */
		usage_days_distribution: MemberUsageDaysDistributionItem[]
	}

	/** Tabs 分页响应数据 */
	export interface PagedResponse<T> {
		/** 当前页码 */
		page: number
		/** 当前筛选条件和 Tab 粒度下的总条数 */
		total: number
		/** 当前页数据 */
		list: T[]
	}

	/** agent_usage：一行一个 agent_code */
	export interface AgentUsageRow {
		/** 数字员工编码 */
		agent_code: string
		/** 数字员工名称；历史优先使用快照，允许为空 */
		agent_name: string | null
		/** 数字员工来源，允许历史遗留数据为空 */
		source_type: AgentSourceType | null
		/** 统计范围内的统一 task 数 */
		call_count: number
		/** 去重调用成员数 */
		member_count: number
		/** 排除空部门后的去重部门数 */
		department_count: number
		/** 积分消耗 */
		points: number
		/** Token 消耗 */
		tokens: number
		/** 最近调用时间 */
		last_called_at: string | null
	}

	/** agent_call：一行一个统一 task_id */
	export interface AgentCallRow {
		/** 统一调用标识 */
		task_id: string
		/** task 最后调用时间 */
		last_called_at: string | null
		/** 调用成员 ID */
		user_id: string
		/** 按当前页 user_id 批量查询的通讯录名称，允许为空 */
		user_name: string | null
		/** 调用部门快照 ID，允许为空 */
		department_id: string | null
		/** 调用部门完整名称路径快照，允许为空 */
		department_name_path: string | null
		/** 数字员工编码 */
		agent_code: string
		/** 数字员工名称快照，允许为空 */
		agent_name: string | null
		/** 数字员工来源，允许历史遗留数据为空 */
		source_type: AgentSourceType | null
		/** task 积分消耗 */
		points: number
		/** task Token 消耗 */
		tokens: number
	}

	/** agent_member：一行一个 agent_code + user_id */
	export interface AgentMemberRow {
		/** 数字员工编码 */
		agent_code: string
		/** 数字员工名称；历史优先使用快照，允许为空 */
		agent_name: string | null
		/** 数字员工来源，允许历史遗留数据为空 */
		source_type: AgentSourceType | null
		/** 成员 ID */
		user_id: string
		/** 按当前页 user_id 批量查询的通讯录名称，允许为空 */
		user_name: string | null
		/** 当前筛选结果中的代表性调用部门 ID，允许为空 */
		department_id: string | null
		/** 代表性调用部门名称路径快照，允许为空 */
		department_name_path: string | null
		/** 该数字员工与成员组合的统一 task 数 */
		call_count: number
		/** 该组合的积分消耗 */
		points: number
		/** 该组合的 Token 消耗 */
		tokens: number
		/** 该组合最近调用时间 */
		last_called_at: string | null
	}

	/** agent_department：一行一个 agent_code + department_id，排除空部门 */
	export interface AgentDepartmentRow {
		/** 数字员工编码 */
		agent_code: string
		/** 数字员工名称；历史优先使用快照，允许为空 */
		agent_name: string | null
		/** 数字员工来源，允许历史遗留数据为空 */
		source_type: AgentSourceType | null
		/** 部门 ID */
		department_id: string
		/** 部门完整名称路径快照，允许为空 */
		department_name_path: string | null
		/** 该数字员工在该部门的去重调用成员数 */
		member_count: number
		/** 该数字员工与部门组合的统一 task 数 */
		call_count: number
		/** 该组合的积分消耗 */
		points: number
		/** 该组合的 Token 消耗 */
		tokens: number
		/** 该组合最近调用时间 */
		last_called_at: string | null
	}

	/** 数字员工 Tabs 行类型 */
	export type AgentTabRow = AgentUsageRow | AgentCallRow | AgentMemberRow | AgentDepartmentRow

	/** member_usage：一行一个 user_id */
	export interface MemberUsageRow {
		/** 成员 ID */
		user_id: string
		/** 按当前页 user_id 批量查询的通讯录名称，允许为空 */
		user_name: string | null
		/** 当前筛选结果中的代表性调用部门 ID，允许为空 */
		department_id: string | null
		/** 代表性调用部门名称路径快照，允许为空 */
		department_name_path: string | null
		/** 当前筛选范围内的统一 task 数 */
		call_count: number
		/** 统一 task 归属日期的去重天数 */
		usage_days: number
		/** 成员在当前筛选范围内的积分消耗 */
		points: number
		/** 成员在当前筛选范围内的 Token 消耗 */
		tokens: number
		/** 当前筛选范围内最近一次调用时间 */
		last_called_at: string | null
	}

	/** member_call：一行一个统一 task_id */
	export interface MemberCallRow {
		/** 统一调用标识 */
		task_id: string
		/** task 最后调用时间 */
		last_called_at: string | null
		/** 调用成员 ID */
		user_id: string
		/** 按当前页 user_id 批量查询的通讯录名称，允许为空 */
		user_name: string | null
		/** 调用部门快照 ID，允许为空 */
		department_id: string | null
		/** 调用部门名称路径快照，允许为空 */
		department_name_path: string | null
		/** 数字员工编码 */
		agent_code: string
		/** 数字员工名称快照，允许为空 */
		agent_name: string | null
		/** 业务类型 */
		business_type: string | null
		/** 资源 ID */
		resource_id: string | null
		/** 资源类型 */
		resource_type: string | null
		/** task 积分消耗 */
		points: number
		/** task Token 消耗 */
		tokens: number
	}

	/** member_agent：一行一个 user_id + agent_code */
	export interface MemberAgentRow {
		/** 成员 ID */
		user_id: string
		/** 按当前页 user_id 批量查询的通讯录名称，允许为空 */
		user_name: string | null
		/** 数字员工编码 */
		agent_code: string
		/** 数字员工名称；历史优先使用快照，允许为空 */
		agent_name: string | null
		/** 该成员与数字员工组合的统一 task 数 */
		call_count: number
		/** 该组合的积分消耗 */
		points: number
		/** 该组合的 Token 消耗 */
		tokens: number
		/** 该组合最近调用时间 */
		last_called_at: string | null
	}

	/** member_silent：一行一个当前在职且统计范围内没有有效调用的 user_id */
	export interface MemberSilentRow {
		/** 当前在职沉默成员 ID */
		user_id: string
		/** 当前通讯录成员名称，允许为空 */
		user_name: string | null
		/** 当前有效主部门 ID，允许为空 */
		department_id: string | null
		/** 当前有效主部门完整名称路径，允许为空 */
		department_name_path: string | null
		/** 成员状态：0 冻结、1 已激活、2 已离职、3 已退出；当前 member_silent 只返回已激活成员 */
		status: 0 | 1 | 2 | 3
		/** 最近调用时间；为空时表示无历史调用 */
		last_called_at: string | null
	}

	/** 成员 Tabs 行类型 */
	export type MemberTabRow = MemberUsageRow | MemberCallRow | MemberAgentRow | MemberSilentRow
}
