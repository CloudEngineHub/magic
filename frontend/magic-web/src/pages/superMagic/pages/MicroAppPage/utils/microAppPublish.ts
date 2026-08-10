import type { PublishedMicroAppProjectItem } from "@/apis/modules/superMagic"

/** 后端发布状态是微应用是否已发布的唯一依据。 */
export function isMicroAppPublished(item?: PublishedMicroAppProjectItem | null): boolean {
	return item?.publish_status === "published"
}
