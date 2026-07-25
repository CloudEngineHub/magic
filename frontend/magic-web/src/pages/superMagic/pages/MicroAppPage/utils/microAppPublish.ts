import type { PublishedMicroAppProjectItem } from "@/apis/modules/superMagic"

/** 兼容发布详情的状态字段与稳定访问资源字段。 */
export function isMicroAppPublished(item?: PublishedMicroAppProjectItem | null): boolean {
	return Boolean(item?.publish_status === "published" || item?.resource_id || item?.access_url)
}
