export type DashboardT = (key: string, options?: Record<string, unknown>) => string

export interface MetricCardData {
	key: string
	label: string
	value: string
	helper: string
	tone: "blue" | "green" | "orange" | "cyan" | "red" | "gray"
}
