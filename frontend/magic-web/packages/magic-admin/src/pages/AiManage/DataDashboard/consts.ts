export const DataDashboardView = {
	MemberAnalysis: "member-analysis",
	OrganizationAnalysis: "organization-analysis",
	DigitalEmployeeAnalysis: "digital-employee-analysis",
	ConsumptionAnalysis: "consumption-analysis",
} as const

export type DataDashboardView = (typeof DataDashboardView)[keyof typeof DataDashboardView]

export const VIEW = DataDashboardView

export const PAGE_TEXT_KEY_BY_VIEW = {
	[DataDashboardView.MemberAnalysis]: "member",
	[DataDashboardView.OrganizationAnalysis]: "organization",
	[DataDashboardView.DigitalEmployeeAnalysis]: "digitalEmployee",
	[DataDashboardView.ConsumptionAnalysis]: "consumption",
} as const satisfies Record<DataDashboardView, string>

export const CHART_SERIES = {
	Member: "member",
	Agent: "agent",
	Consumption: "consumption",
} as const

export type ChartSeries = (typeof CHART_SERIES)[keyof typeof CHART_SERIES]

export const TREND_DATA_KEY = {
	Period: "period",
	Calls: "calls",
	Amount: "amount",
	Tokens: "tokens",
	ActiveAgents: "activeAgents",
	ActiveMembers: "activeMembers",
} as const

export const METRIC_KEY = {
	ActiveMembers: "activeMembers",
	ActivationRate: "activationRate",
	NewMembers: "newMembers",
	SilentMembers: "silentMembers",
	MemberCalls: "memberCalls",
	MemberAvgCalls: "memberAvgCalls",
	MemberAvgAmount: "memberAvgAmount",
	MemberAvgTokens: "memberAvgTokens",
	DepartmentLevels: "departmentLevels",
	CoveredDepartments: "coveredDepartments",
	UncoveredDepartments: "uncoveredDepartments",
	DepartmentCoverage: "departmentCoverage",
	DepartmentAverageActivationRate: "departmentAverageActivationRate",
	DepartmentCalls: "departmentCalls",
	DepartmentAmount: "departmentAmount",
	DepartmentTokens: "departmentTokens",
	DepartmentMemberAvgCalls: "departmentMemberAvgCalls",
	DepartmentMemberAvgAmount: "departmentMemberAvgAmount",
	DepartmentMemberAvgTokens: "departmentMemberAvgTokens",
	AgentTotal: "agentTotal",
	ActiveAgents: "activeAgents",
	AgentActiveRate: "agentActiveRate",
	AgentCalls: "agentCalls",
	AgentMembers: "agentMembers",
	AgentDepartments: "agentDepartments",
	AgentAmount: "agentAmount",
	AgentTokens: "agentTokens",
	TotalAmount: "totalAmount",
	TotalTokens: "totalTokens",
	DailyAmount: "dailyAmount",
	DailyTokens: "dailyTokens",
	AvgAmount: "avgAmount",
	AvgTokens: "avgTokens",
	DepartmentAvgAmount: "departmentAvgAmount",
	DepartmentAvgTokens: "departmentAvgTokens",
	AgentAvgAmount: "agentAvgAmount",
	AgentAvgTokens: "agentAvgTokens",
} as const

export type MetricKey = (typeof METRIC_KEY)[keyof typeof METRIC_KEY]

export const TABLE_PAGE_SIZE = 10

export const ALL_OPTION_VALUE = "__all"

export const AGENT_SOURCE_TYPE = {
	LocalCreate: "LOCAL_CREATE",
	Market: "MARKET",
	Organization: "ORGANIZATION",
} as const

export const AGENT_SOURCE_OPTIONS = [
	{ labelKey: "sourceTypes.market", value: AGENT_SOURCE_TYPE.Market },
	{ labelKey: "sourceTypes.organization", value: AGENT_SOURCE_TYPE.Organization },
	{ labelKey: "sourceTypes.localCreate", value: AGENT_SOURCE_TYPE.LocalCreate },
] as const

export const AGENT_TAB_TYPE = {
	Usage: "agent_usage",
	Call: "agent_call",
	Member: "agent_member",
	Department: "agent_department",
} as const

export const MEMBER_TAB_TYPE = {
	Usage: "member_usage",
	Call: "member_call",
	Agent: "member_agent",
	Silent: "member_silent",
} as const

export const DEFAULT_TAB_BY_VIEW = {
	[VIEW.MemberAnalysis]: MEMBER_TAB_TYPE.Usage,
	[VIEW.DigitalEmployeeAnalysis]: AGENT_TAB_TYPE.Usage,
} as const

export const TABLE_SCROLL_X = {
	SilentMembers: 900,
	Department: 1290,
	Member: 1750,
	Agent: 1350,
	MemberAgent: 1400,
	MemberRecord: 1350,
	Record: 1120,
} as const

export const RATIO_BASE = 100
export const MAX_PROGRESS_PERCENT = 100
export const RANKING_DISPLAY_LIMIT = 6
export const CHART_MAX_BAR_SIZE = 78

export const BUCKET_TONE = {
	High: "#059669",
	Stable: "#0284c7",
	Low: "#d97706",
	Unused: "#8e8e8e",
} as const

export const DICTIONARY_BADGE_TONE = {
	FilterFirst: BUCKET_TONE.Stable,
	AggregateAgain: BUCKET_TONE.High,
	DimensionTables: BUCKET_TONE.Unused,
	KeepDetails: BUCKET_TONE.Low,
} as const

export const USAGE_THRESHOLD = {
	DepartmentHighActivationRate: 0.5,
	DepartmentMediumActivationRate: 0.2,
	AgentHighCalls: 30,
	AgentStableCalls: 8,
	MemberHighUsageDays: 5,
	MemberStableUsageDays: 2,
	MemberLightUsageDays: 1,
} as const

export const METRIC_TONE_MAP = {
	blue: { color: "#0b84c6", bg: "#eef7ff" },
	green: { color: "#0f9f6e", bg: "#ecfdf5" },
	orange: { color: "#d97706", bg: "#fff7ed" },
	cyan: { color: "#0891b2", bg: "#ecfeff" },
	red: { color: "#dc2626", bg: "#fff1f0" },
	gray: { color: "#8c8c8c", bg: "#f7f7f7" },
}

export const CHART_COLORS = {
	calls: "#0b84c6",
	amount: "#0f9f6e",
	tokens: "#7c3aed",
	activeMembers: "#d97706",
	activeAgents: "#0f9f6e",
}

export const CSV_TITLE_BY_VIEW: Record<DataDashboardView, string> = {
	[VIEW.MemberAnalysis]: VIEW.MemberAnalysis,
	[VIEW.OrganizationAnalysis]: VIEW.OrganizationAnalysis,
	[VIEW.DigitalEmployeeAnalysis]: VIEW.DigitalEmployeeAnalysis,
	[VIEW.ConsumptionAnalysis]: VIEW.ConsumptionAnalysis,
}
