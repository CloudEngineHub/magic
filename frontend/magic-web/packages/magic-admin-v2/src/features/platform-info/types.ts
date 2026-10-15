import type { Language } from "@magic-admin-v2/i18n/resources";

export type PlatformLocale = Language;

export type PlatformLocalizedText = Partial<Record<PlatformLocale, string>>;

export type PlatformInfoFooterFiling = {
  enabled: boolean;
  number: string;
  link: string;
};

export type PlatformInfoFooter = {
  copyright_i18n: PlatformLocalizedText;
  filing: PlatformInfoFooterFiling;
};

/** 组织水印中可展示的用户信息字段。 */
export type PlatformWatermarkField =
  | "real_name"
  | "employee_no"
  | "visit_time"
  | "department"
  | "phone"
  | "email";

/** 组织水印的深浅档位，与后端 `watermark.depth` 的取值保持一致。 */
export type PlatformWatermarkDepth = "light" | "standard" | "strong";

/** 组织水印配置；后端只返回 enabled、fields、depth 三个字段。 */
export type PlatformInfoWatermark = {
  enabled: boolean;
  fields: PlatformWatermarkField[];
  depth: PlatformWatermarkDepth;
};

/** 仅供展示的倍率配置，金额以十进制字符串传递，空值表示未填写。 */
export type ModelBillingMultiplierSettings = {
  enabled: boolean;
  base_price_cny: string | null;
  usd_to_cny_rate: string | null;
};

export type PlatformInfoDetails = {
  model_billing_multiplier?: ModelBillingMultiplierSettings;
  logo: PlatformLocalizedText;
  favicon: string | null;
  minimal_logo: string | null;
  default_language: PlatformLocale | string;
  footer?: PlatformInfoFooter;
  watermark?: PlatformInfoWatermark;
  name_i18n: PlatformLocalizedText;
  title_i18n: PlatformLocalizedText;
  keywords_i18n: PlatformLocalizedText;
  description_i18n: PlatformLocalizedText;
  agent_role_name_i18n?: PlatformLocalizedText;
  agent_role_description_i18n?: PlatformLocalizedText;
  global_system_prompt?: string;
  custom_service_provider_whitelist?: string[];
};

export type PlatformInfoFormState = {
  model_billing_multiplier: ModelBillingMultiplierSettings;
  logo: Record<PlatformLocale, string>;
  favicon: string;
  minimal_logo: string;
  default_language: PlatformLocale;
  footer: {
    copyright_i18n: Record<PlatformLocale, string>;
    filing: PlatformInfoFooterFiling;
  };
  watermark: PlatformInfoWatermark;
  name_i18n: Record<PlatformLocale, string>;
  title_i18n: Record<PlatformLocale, string>;
  keywords_i18n: Record<PlatformLocale, string>;
  description_i18n: Record<PlatformLocale, string>;
  agent_role_name_i18n: Record<PlatformLocale, string>;
  agent_role_description_i18n: Record<PlatformLocale, string>;
  global_system_prompt: string;
};

export type UpdatePlatformInfoParams = {
  model_billing_multiplier: ModelBillingMultiplierSettings;
  logo_zh_url: string;
  logo_en_url: string;
  minimal_logo_url: string;
  favicon_url: string;
  default_language: PlatformLocale;
  footer: PlatformInfoFormState["footer"];
  watermark: PlatformInfoWatermark;
  name_i18n: Record<PlatformLocale, string>;
  title_i18n: Record<PlatformLocale, string>;
  keywords_i18n: Record<PlatformLocale, string>;
  description_i18n: Record<PlatformLocale, string>;
  agent_role_name_i18n: Record<PlatformLocale, string>;
  agent_role_description_i18n: Record<PlatformLocale, string>;
  global_system_prompt: string;
};
