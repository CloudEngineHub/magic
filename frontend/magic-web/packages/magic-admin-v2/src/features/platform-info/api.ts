import { RequestUrl } from "@magic-admin-v2/api/constants";
import type { HttpClient, RequestOptions } from "@magic-admin-v2/api/types";
import type {
  PlatformInfoDetails,
  PlatformInfoFormState,
  PlatformLocale,
  UpdatePlatformInfoParams,
} from "@magic-admin-v2/features/platform-info/types";
import { Language } from "@magic-admin-v2/i18n/resources";

const emptyLocalizedText: Record<PlatformLocale, string> = {
  zh_CN: "",
  en_US: "",
};

function normalizeLocale(value: unknown): PlatformLocale {
  return value === Language.EnUS ? Language.EnUS : Language.ZhCN;
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
