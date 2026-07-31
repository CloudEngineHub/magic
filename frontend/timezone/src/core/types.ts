export declare namespace Timezone {
	type Locale = "zh_CN" | "en_US"
	type TimezoneCode = string
	type TimeInput = string | number | Date

	interface TimezoneItem {
		code: TimezoneCode
		offset: string
		offsetMinutes: number
		label: string
		city?: string
		countryCode?: string
		group?: string
	}

	interface ListTimezonesOptions {
		locale?: Locale
		keyword?: string
		groupByOffset?: boolean
	}
}
