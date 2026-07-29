# @dtyq/timezone

Consistent timezone data and utilities for web applications.

This package helps you:

- Render a standardized timezone list in UI
- Convert and format time across different timezones
- Build common date range values (day/month)
- Handle multilingual timezone labels
- Reuse business-ready helper methods

## Installation

```bash
pnpm add @dtyq/timezone dayjs
# or
npm i @dtyq/timezone dayjs
```

`dayjs` is a peer dependency and should be installed by your application.

## Runtime Support

- Modern browsers
- Node.js `>=16`
- SSR environments (for example Next.js/Nuxt)

The package ships TypeScript types and can be used in TypeScript or JavaScript projects.

## Quick Start

```ts
import {
  getTimezones,
  convertTime,
  getDayRange,
  buildTimezoneSelectOptions,
} from "@dtyq/timezone"

const timezoneOptions = buildTimezoneSelectOptions({
  locale: "en_US",
  preferred: ["Asia/Shanghai", "Europe/London", "America/New_York"],
})

const text = convertTime("2026-03-08 09:00:00", {
  from: "Asia/Shanghai",
  to: "America/New_York",
  format: "YYYY-MM-DD HH:mm:ss",
})

const [start, end] = getDayRange({
  timezone: "Asia/Shanghai",
  format: "YYYY-MM-DD HH:mm:ss",
})
```

## API Overview

### Timezone Catalog

- `getTimezones(options?)`
- `getTimezone(code, locale?)`

Use these for dropdowns, search, and timezone detail display.

### Time Conversion

- `now(options?)`
- `convertTime(input, options)`
- `toTimestamp(input, options?)`
- `formatInTimezone(input, options)`

Use these to convert and format values between source and target timezones.

### Time Ranges

- `getDayRange(options)`
- `getMonthRange(options)`

Use these for query ranges, reports, and filtering windows.

### Business Utilities

- `isCrossDay(input)`
- `buildTimezoneSelectOptions(options?)`
- `normalizeMeetingTime(input)`

Use these for common product-level scenarios.

## Core Data Structures

```ts
type Locale = "zh_CN" | "en_US" | string
type TimezoneCode = string // IANA, e.g. "Asia/Shanghai"
type TimeInput = string | number | Date

interface TimezoneItem {
  code: TimezoneCode
  offset: string          // e.g. "+08:00"
  offsetMinutes: number   // e.g. 480
  label: string           // localized display text
  city?: string
  countryCode?: string
  group?: string
}
```

## Internationalization

Built-in locales:

- `en_US`
- `zh_CN`

You can register custom locale messages:

```ts
import { registerLocale, setDefaultLocale } from "@dtyq/timezone"

registerLocale("fr_FR", {
  "Asia/Shanghai": "(GMT+08:00) Shanghai",
})

setDefaultLocale("fr_FR")
```

Fallback order:

1. target locale
2. `en_US`
3. timezone code

## Dayjs Integration

If your app initializes dayjs plugins in a shared bootstrap file, inject the same instance:

```ts
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezonePlugin from "dayjs/plugin/timezone"
import { configureDayjs } from "@dtyq/timezone"

dayjs.extend(utc)
dayjs.extend(timezonePlugin)

configureDayjs(dayjs)
```

This guarantees app code and package code use the same dayjs instance.

## Error Handling

The package throws `TimezoneError` with stable codes:

- `INVALID_TIME_INPUT`
- `INVALID_TIMEZONE`
- `INVALID_FORMAT`
- `LOCALE_NOT_FOUND`
- `UNSUPPORTED_OPERATION`

Example:

```ts
import { convertTime } from "@dtyq/timezone"

try {
  convertTime("invalid-time", { to: "Asia/Shanghai" })
} catch (error) {
  // handle error in your app
}
```

## Best Practices

- Persist only IANA timezone code in backend/database
- Use UTC timestamp for transport between client and server
- Convert to display timezone only in UI/application layer
- Always provide timezone in cross-day comparisons

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT. See [LICENSE](./LICENSE).
