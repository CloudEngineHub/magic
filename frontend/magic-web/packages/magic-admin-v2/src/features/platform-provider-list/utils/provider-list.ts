import {
  providerSelectAllValue,
  providerStatus,
  providerType,
  type ProviderListItem,
} from "@magic-admin-v2/features/platform-provider-list/types";

export const providerPageSize = 20;

export type ProviderSearchField = "name" | "alias" | "provider_id";

export type ProviderFilterDraft = {
  alias: string;
  name: string;
  provider_id: string;
  provider_type: string;
  search_field: ProviderSearchField;
  status: string;
};

export function createDefaultProviderFilterDraft(): ProviderFilterDraft {
  return {
    alias: "",
    name: "",
    provider_id: "",
    provider_type: providerSelectAllValue,
    search_field: "name",
    status: providerSelectAllValue,
  };
}

/** 官方服务商优先，其次按启用状态和升序排序值展示列表。 */
export function sortProviders(items: ProviderListItem[]) {
  return [...items].sort((a, b) => {
    if (a.provider_type === providerType.official && b.provider_type !== providerType.official) {
      return -1;
    }
    if (a.provider_type !== providerType.official && b.provider_type === providerType.official) {
      return 1;
    }
    return (b.status ?? 0) - (a.status ?? 0) || (a.sort ?? 0) - (b.sort ?? 0);
  });
}

export function filterProviders(items: ProviderListItem[], filter: ProviderFilterDraft) {
  const searchConditions = [
    [filter.name, (item: ProviderListItem) => item.name],
    [filter.alias, (item: ProviderListItem) => item.alias],
    [
      filter.provider_id,
      (item: ProviderListItem) => [
        item.service_provider_id,
        item.id,
      ],
    ],
  ].filter(([value]) => typeof value === "string" && Boolean(value.trim())) as Array<[
    string,
    (item: ProviderListItem) => unknown,
  ]>;

  return items.filter((item) => {
    if (filter.status !== providerSelectAllValue && String(item.status) !== filter.status) {
      return false;
    }
    if (
      filter.provider_type !== providerSelectAllValue &&
      String(item.provider_type) !== filter.provider_type
    ) {
      return false;
    }
    return searchConditions.every(([value, getTarget]) => {
      // A provider can be referenced by its template ID or its per-organization config ID.
      const targets = getTarget(item);
      const values = Array.isArray(targets) ? targets : [targets];
      return values.some((target) =>
        String(target ?? "")
          .toLowerCase()
          .includes(value.trim().toLowerCase()),
      );
    });
  });
}

export function paginateProviders<T>(items: T[], page: number, pageSize = providerPageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  return {
    currentPage,
    pageItems: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    totalPages,
  };
}

export function getProviderStatusStats(items: ProviderListItem[]) {
  const enabled = items.filter((item) => item.status === providerStatus.enabled).length;

  return {
    enabled,
    disabled: items.length - enabled,
    total: items.length,
  };
}
