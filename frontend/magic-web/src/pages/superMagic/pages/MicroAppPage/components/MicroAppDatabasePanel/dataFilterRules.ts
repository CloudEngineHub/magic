import type {
	MagicBaseColumn,
	MagicBaseFilterCondition,
	MagicBaseFilterGroup,
	MagicBaseFilterLogic,
	MagicBaseFilterOperator,
	MagicBaseFilterScalar,
} from "@/apis/modules/magicBase"

import { isMagicBaseFilterCondition } from "./utils"

export interface DraftFilterCondition {
	field: string
	operator: MagicBaseFilterOperator
	value: string
}

export const MAX_FILTER_CONDITIONS = 10
export const MAX_OR_FILTER_CONDITIONS = 5

const FILTERABLE_DATA_TYPES = new Set(["boolean", "datetime", "id", "number", "text"])

const OPERATORS_BY_DATA_TYPE: Record<string, MagicBaseFilterOperator[]> = {
	id: ["eq", "gt", "gte", "lt", "lte", "in"],
	text: ["contains", "eq", "in"],
	number: ["eq", "gt", "gte", "lt", "lte", "in"],
	datetime: ["eq", "gt", "gte", "lt", "lte"],
	boolean: ["eq", "in"],
}

export function isSystemFilterColumn(column: MagicBaseColumn) {
	return column.source === "system" || column.system === true
}

export function getFilterableColumns(columns: MagicBaseColumn[]) {
	const filterableColumns = columns.filter(
		(column) => column.status !== "disabled" && FILTERABLE_DATA_TYPES.has(column.data_type),
	)
	return [
		...filterableColumns.filter((column) => !isSystemFilterColumn(column)),
		...filterableColumns.filter(isSystemFilterColumn),
	]
}

export function getFilterOperators(column?: MagicBaseColumn): MagicBaseFilterOperator[] {
	return OPERATORS_BY_DATA_TYPE[column?.data_type || ""] || []
}

export function getDefaultFilterOperator(column?: MagicBaseColumn): MagicBaseFilterOperator {
	return getFilterOperators(column)[0] || "eq"
}

export function getFilterConditionLimit(logic: MagicBaseFilterLogic) {
	return logic === "or" ? MAX_OR_FILTER_CONDITIONS : MAX_FILTER_CONDITIONS
}

export function getRootFilterConditions(filter: MagicBaseFilterGroup): MagicBaseFilterCondition[] {
	return filter.items.filter(isMagicBaseFilterCondition)
}

export function toDraftFilterValue(column: MagicBaseColumn, condition: MagicBaseFilterCondition) {
	const value = Array.isArray(condition.value) ? condition.value.join(", ") : condition.value
	if (column.data_type === "datetime") return String(value).replace(" ", "T").slice(0, 19)
	return String(value)
}

function normalizeScalar(column: MagicBaseColumn, value: string): MagicBaseFilterScalar {
	const trimmed = value.trim()
	if (column.data_type === "boolean") return trimmed === "true"
	if (column.data_type === "number") return Number(trimmed)
	if (column.data_type === "datetime") {
		const normalized = trimmed.replace("T", " ")
		return normalized.length === 16 ? `${normalized}:00` : normalized
	}
	return trimmed
}

export function toFilterCondition(
	column: MagicBaseColumn,
	condition: DraftFilterCondition,
): MagicBaseFilterCondition {
	const value =
		condition.operator === "in"
			? condition.value
					.split(",")
					.map((item) => item.trim())
					.filter(Boolean)
					.map((item) => normalizeScalar(column, item))
			: normalizeScalar(column, condition.value)
	return {
		field: condition.field,
		operator: condition.operator,
		value,
	}
}

function isValidScalar(column: MagicBaseColumn, value: string) {
	const trimmed = value.trim()
	if (!trimmed) return false
	if (column.data_type === "id") return /^[1-9]\d*$/.test(trimmed)
	if (column.data_type === "number") return Number.isFinite(Number(trimmed))
	if (column.data_type === "boolean") return trimmed === "true" || trimmed === "false"
	return true
}

export function isValidDraftFilterCondition(
	condition: DraftFilterCondition,
	columns: MagicBaseColumn[],
) {
	const column = columns.find((item) => item.column_key === condition.field)
	if (!column) return false
	if (condition.operator === "contains") {
		const length = Array.from(condition.value.trim()).length
		return length >= 2 && length <= 100
	}
	if (condition.operator === "in") {
		const values = condition.value.split(",").map((item) => item.trim())
		return (
			values.length > 0 &&
			values.length <= 100 &&
			values.every((item) => isValidScalar(column, item))
		)
	}
	return isValidScalar(column, condition.value)
}
