import { env } from "@/utils/env"

/** 与 APM 探针使用同一套 tag 优先、commit SHA 兜底的发布版本。 */
export function getAppRelease(): string {
	return env("MAGIC_APP_VERSION") || env("MAGIC_APP_SHA") || ""
}
