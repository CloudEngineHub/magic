import dayjs from "@/infrastructure/vendors/dayjs"
import type { RecycleBinItem } from "./recycle-bin-domain"

export type RecycleBinFileView = "list" | "grid" | "location"
export type RecycleBinSearchPeriod = "recent" | "custom" | number
export interface RecycleBinTimeRange {
	start: string
	end: string
}

export interface RecycleBinFileGroup {
	key: string
	location: string | null
	day: string | null
	items: RecycleBinItem[]
}

const TIME_ZONE = "Asia/Shanghai"

/** 回收站写入和查询按服务既有时区切日，避免用户本地时区改变同一记录的分组。 */
export function parseRecycleBinTime(value: string) {
	if (!dayjs(value).isValid()) return dayjs(value)
	return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
		? dayjs(value).tz(TIME_ZONE)
		: dayjs.tz(value, TIME_ZONE)
}

export function createRecycleBinTimeRange(hours: number): RecycleBinTimeRange {
	const end = dayjs().tz(TIME_ZONE).startOf("second")
	return {
		start: end.subtract(hours, "hour").format("YYYY-MM-DDTHH:mm:ss"),
		end: end.format("YYYY-MM-DDTHH:mm:ss"),
	}
}

export function buildRecycleBinGroups(items: RecycleBinItem[], view: RecycleBinFileView) {
	const groups = new Map<string, RecycleBinFileGroup>()
	for (const item of items) {
		const time = item.deletedOn ? parseRecycleBinTime(item.deletedOn) : null
		const day = time?.isValid() ? time.format("YYYY-MM-DD") : null
		const location = item.originalPath ?? null
		const key =
			view === "location" ? `location:${location ?? "unknown"}` : `day:${day ?? "unknown"}`
		let group = groups.get(key)
		if (!group) {
			group = { key, location, day, items: [] }
			groups.set(key, group)
		}
		group.items.push(item)
	}
	// 输入已按删除时间倒序；首次出现顺序就是各分组最新记录的顺序，无须重复排序。
	return [...groups.values()]
}
