import { RequestUrl } from "@magic-admin-v2/api/constants";
import type { HttpClient, RequestOptions } from "@magic-admin-v2/api/types";
import type {
  PlatformInfoDetails,
  PlatformInfoFormState,
  PlatformInfoWatermark,
  PlatformLocale,
  PlatformWatermarkDepth,
  PlatformWatermarkField,
  UpdatePlatformInfoParams,
} from "@magic-admin-v2/features/platform-info/types";
import {
  platformWatermarkDepths,
  platformWatermarkFields,
} from "@magic-admin-v2/features/platform-info/utils";
import { Language } from "@magic-admin-v2/i18n/resources";

const emptyLocalizedText: Record<PlatformLocale, string> = {
  zh_CN: "",
  en_US: "",
};

/** 与后端 platform_settings 的默认水印配置保持一致。 */
const defaultWatermark: PlatformInfoWatermark = {
  enabled: false,
  fields: ["real_name"],
  depth: "light",
};

function normalizeLocale(value: unknown): PlatformLocale {
  return value === Language.EnUS ? Language.EnUS : Language.ZhCN;
}

function normalizeWatermarkDepth(value?: string): PlatformWatermarkDepth {
  return platformWatermarkDepths.find((depth) => depth === value) ?? defaultWatermark.depth;
}

function normalizeWatermarkFields(value?: readonly string[]): PlatformWatermarkField[] {
  const selected = new Set(value ?? []);

  // 只保留前端能渲染的字段并按固定顺序输出，避免后端返回未知字段或乱序时
  // 复选框组出现无法取消的脏数据。
  return platformWatermarkFields.filter((field) => selected.has(field));
}

/**
 * 归一化服务端水印配置。缺省字段回退到后端默认值，
 * 保证预览态、编辑态与提交参数使用同一份结构。
 */
export function normalizePlatformWatermark(
  value?: Partial<PlatformInfoWatermark> | null,
): PlatformInfoWatermark {
  if (!value) {
    return { ...defaultWatermark, fields: [...defaultWatermark.fields] };
  }

  return {
    enabled: value.enabled ?? defaultWatermark.enabled,
    fields: normalizeWatermarkFields(value.fields),
    depth: normalizeWatermarkDepth(value.depth),
  };
}

function normalizeLocalizedText(value?: Partial<Record<PlatformLocale, string>>) {
  return {
    zh_CN: value?.zh_CN ?? "",
    en_US: value?.en_US ?? "",
  };
}

export function toPlatformInfoFormState(data: PlatformInfoDetails): PlatformInfoFormState {
  return {
    logo: normalizeLocalizedText(data.logo),
    favicon: data.favicon ?? "",
    minimal_logo: data.minimal_logo ?? "",
    default_language: normalizeLocale(data.default_language),
    footer: {
      copyright_i18n: normalizeLocalizedText(data.footer?.copyright_i18n),
      filing: {
        enabled: data.footer?.filing?.enabled ?? false,
        number: data.footer?.filing?.number ?? "",
        link: data.footer?.filing?.link ?? "https://beian.miit.gov.cn/",
      },
    },
    watermark: normalizePlatformWatermark(data.watermark),
    name_i18n: normalizeLocalizedText(data.name_i18n),
    title_i18n: normalizeLocalizedText(data.title_i18n),
    keywords_i18n: normalizeLocalizedText(data.keywords_i18n),
    description_i18n: normalizeLocalizedText(data.description_i18n),
    agent_role_name_i18n: normalizeLocalizedText(data.agent_role_name_i18n),
    agent_role_description_i18n: normalizeLocalizedText(data.agent_role_description_i18n),
    global_system_prompt: data.global_system_prompt ?? "",
  };
}

export function createEmptyPlatformInfoFormState(): PlatformInfoFormState {
  return {
    logo: { ...emptyLocalizedText },
    favicon: "",
    minimal_logo: "",
    default_language: Language.ZhCN,
    footer: {
      copyright_i18n: { ...emptyLocalizedText },
      filing: {
        enabled: false,
        number: "",
        link: "https://beian.miit.gov.cn/",
      },
    },
    watermark: normalizePlatformWatermark(),
    name_i18n: { ...emptyLocalizedText },
    title_i18n: { ...emptyLocalizedText },
    keywords_i18n: { ...emptyLocalizedText },
    description_i18n: { ...emptyLocalizedText },
    agent_role_name_i18n: { ...emptyLocalizedText },
    agent_role_description_i18n: { ...emptyLocalizedText },
    global_system_prompt: "",
  };
}

export function createDefaultPlatformInfoDetails(): PlatformInfoDetails {
  const defaults = createEmptyPlatformInfoFormState();

  return {
    logo: defaults.logo,
    favicon: null,
    minimal_logo: null,
    default_language: defaults.default_language,
    footer: defaults.footer,
    watermark: defaults.watermark,
    name_i18n: defaults.name_i18n,
    title_i18n: defaults.title_i18n,
    keywords_i18n: defaults.keywords_i18n,
    description_i18n: defaults.description_i18n,
    agent_role_name_i18n: defaults.agent_role_name_i18n,
    agent_role_description_i18n: defaults.agent_role_description_i18n,
    global_system_prompt: defaults.global_system_prompt,
  };
}

export function toUpdatePlatformInfoParams(
  values: PlatformInfoFormState,
): UpdatePlatformInfoParams {
  return {
    logo_zh_url: values.logo.zh_CN,
    logo_en_url: values.logo.en_US,
    minimal_logo_url: values.minimal_logo,
    favicon_url: values.favicon,
    default_language: values.default_language,
    footer: values.footer,
    watermark: values.watermark,
    name_i18n: values.name_i18n,
    title_i18n: values.title_i18n,
    keywords_i18n: values.keywords_i18n,
    description_i18n: values.description_i18n,
    agent_role_name_i18n: values.agent_role_name_i18n,
    agent_role_description_i18n: values.agent_role_description_i18n,
    global_system_prompt: values.global_system_prompt,
  };
}

export function toChangedPlatformInfoParams(
  values: PlatformInfoFormState,
  dirtyFields: Partial<Record<keyof PlatformInfoFormState, unknown>>,
): Partial<UpdatePlatformInfoParams> {
  const params: Partial<UpdatePlatformInfoParams> = {};

  if (dirtyFields.logo && typeof dirtyFields.logo === "object") {
    const dirtyLogo = dirtyFields.logo as Partial<Record<PlatformLocale, unknown>>;
    if (dirtyLogo.zh_CN) params.logo_zh_url = values.logo.zh_CN;
    if (dirtyLogo.en_US) params.logo_en_url = values.logo.en_US;
  }
  if (dirtyFields.minimal_logo) params.minimal_logo_url = values.minimal_logo;
  if (dirtyFields.favicon) params.favicon_url = values.favicon;
  if (dirtyFields.default_language) params.default_language = values.default_language;
  if (dirtyFields.footer) params.footer = values.footer;
  // 水印的 enabled、fields、depth 相互依赖（开启时必须有内容），
  // 因此任一子字段变化都提交完整水印对象，后端按 array_replace 合并。
  if (dirtyFields.watermark) params.watermark = values.watermark;
  if (dirtyFields.name_i18n) params.name_i18n = values.name_i18n;
  if (dirtyFields.title_i18n) params.title_i18n = values.title_i18n;
  if (dirtyFields.keywords_i18n) params.keywords_i18n = values.keywords_i18n;
  if (dirtyFields.description_i18n) params.description_i18n = values.description_i18n;
  if (dirtyFields.agent_role_name_i18n) {
    params.agent_role_name_i18n = values.agent_role_name_i18n;
  }
  if (dirtyFields.agent_role_description_i18n) {
    params.agent_role_description_i18n = values.agent_role_description_i18n;
  }
  if (dirtyFields.global_system_prompt) {
    params.global_system_prompt = values.global_system_prompt;
  }

  return params;
}

export function createPlatformInfoApi(client: HttpClient) {
  return {
    getPlatformInfo(options?: RequestOptions) {
      return client.get<PlatformInfoDetails>(RequestUrl.platformInfo, options);
    },
    updatePlatformInfo(params: Partial<UpdatePlatformInfoParams>, options?: RequestOptions) {
      return client.put<PlatformInfoDetails>(RequestUrl.platformInfo, params, options);
    },
  };
}
