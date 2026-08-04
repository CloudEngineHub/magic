import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezonePlugin from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezonePlugin)

export { dayjs }
