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

export type PlatformInfoDetails = {
  logo: PlatformLocalizedText;
  favicon: string | null;
  minimal_logo: string | null;
  default_language: PlatformLocale | string;
  footer?: PlatformInfoFooter;
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
  logo: Record<PlatformLocale, string>;
  favicon: string;
  minimal_logo: string;
  default_language: PlatformLocale;
  footer: {
    copyright_i18n: Record<PlatformLocale, string>;
    filing: PlatformInfoFooterFiling;
  };
  name_i18n: Record<PlatformLocale, string>;
  title_i18n: Record<PlatformLocale, string>;
  keywords_i18n: Record<PlatformLocale, string>;
  description_i18n: Record<PlatformLocale, string>;
  agent_role_name_i18n: Record<PlatformLocale, string>;
  agent_role_description_i18n: Record<PlatformLocale, string>;
  global_system_prompt: string;
};

export type UpdatePlatformInfoParams = {
  logo_zh_url: string;
  logo_en_url: string;
  minimal_logo_url: string;
  favicon_url: string;
  default_language: PlatformLocale;
  footer: PlatformInfoFormState["footer"];
  name_i18n: Record<PlatformLocale, string>;
  title_i18n: Record<PlatformLocale, string>;
  keywords_i18n: Record<PlatformLocale, string>;
  description_i18n: Record<PlatformLocale, string>;
  agent_role_name_i18n: Record<PlatformLocale, string>;
  agent_role_description_i18n: Record<PlatformLocale, string>;
  global_system_prompt: string;
};
