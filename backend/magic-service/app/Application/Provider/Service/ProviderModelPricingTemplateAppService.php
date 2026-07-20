<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Provider\Service;

use App\Domain\Provider\Entity\ValueObject\Category;
use App\Domain\Provider\Entity\ValueObject\ProviderCode;

class ProviderModelPricingTemplateAppService
{
    private const CONFIG_KEY = 'provider_model_pricing_templates';

    /**
     * 支持测试注入配置；线上默认读取 provider_model_pricing_templates 配置。
     */
    public function __construct(
        private readonly ?array $templatesConfig = null,
    ) {
    }

    /**
     * 查询服务商在指定模型场景下可用的价格配置模板。
     *
     * @return array<int, array<string, mixed>>
     */
    public function queries(
        Category $category,
        ProviderCode $providerCode,
        ?string $modelId = null
    ): array {
        $config = $this->loadTemplatesConfig();
        $templateCodes = $this->resolveTemplateCodes($config, $category, $providerCode, $modelId);

        return $this->filterTemplatesByCodes($config['templates'] ?? [], $templateCodes, $category);
    }

    /**
     * 加载价格模板配置。
     */
    private function loadTemplatesConfig(): array
    {
        $config = $this->templatesConfig ?? config(self::CONFIG_KEY, []);
        return is_array($config) ? $config : [];
    }

    /**
     * 根据模板 code 取回模板详情，并过滤掉类别不匹配的异常配置。
     *
     * @return array<int, array<string, mixed>>
     */
    private function filterTemplatesByCodes(array $templates, array $templateCodes, Category $category): array
    {
        $templatesByCode = $this->indexTemplatesByCode($templates);
        $matchedTemplates = [];

        foreach ($templateCodes as $templateCode) {
            $template = $templatesByCode[$templateCode] ?? null;
            if (($template['category'] ?? null) !== $category->value) {
                continue;
            }

            $matchedTemplates[] = $template;
        }

        return $matchedTemplates;
    }

    /**
     * 解析模板 code 优先级：模型专属模板 > 服务商模板 > 类别默认模板。
     *
     * @return array<int, string>
     */
    private function resolveTemplateCodes(
        array $config,
        Category $category,
        ProviderCode $providerCode,
        ?string $modelId = null
    ): array {
        $normalizedModelId = trim((string) $modelId);
        if ($normalizedModelId !== '') {
            $templateCodes = $this->findTemplateCodes(
                $config['model_templates'] ?? [],
                $category,
                $providerCode,
                $normalizedModelId
            );
            if ($templateCodes !== []) {
                return $templateCodes;
            }
        }

        $templateCodes = $this->findTemplateCodes($config['provider_templates'] ?? [], $category, $providerCode);
        if ($templateCodes !== []) {
            return $templateCodes;
        }

        return $this->normalizeStringList($config['defaults'][$category->value] ?? []);
    }

    /**
     * 从一组模板匹配规则中找到第一条符合服务商、类别和模型条件的模板 code。
     *
     * @return array<int, string>
     */
    private function findTemplateCodes(
        array $rules,
        Category $category,
        ProviderCode $providerCode,
        ?string $modelId = null
    ): array {
        foreach ($rules as $rule) {
            if (! is_array($rule) || ! $this->matchesProviderCategory($rule, $category, $providerCode)) {
                continue;
            }
            if ($modelId !== null && ! $this->matchesModelId($rule, $modelId)) {
                continue;
            }

            return $this->normalizeStringList($rule['template_codes'] ?? []);
        }

        return [];
    }

    /**
     * 判断规则是否适用于当前服务商和模型类别。
     */
    private function matchesProviderCategory(array $rule, Category $category, ProviderCode $providerCode): bool
    {
        return ($rule['provider_code'] ?? null) === $providerCode->value
            && ($rule['category'] ?? null) === $category->value;
    }

    /**
     * 将模板列表按 code 建索引，方便按 template_codes 保序取回。
     *
     * @return array<string, array<string, mixed>>
     */
    private function indexTemplatesByCode(array $templates): array
    {
        $indexedTemplates = [];
        foreach ($templates as $template) {
            if (! is_array($template)) {
                continue;
            }

            $code = $template['code'] ?? null;
            if (! is_string($code) || $code === '') {
                continue;
            }
            $indexedTemplates[$code] = $template;
        }

        return $indexedTemplates;
    }

    /**
     * 判断规则声明的模型标识是否包含当前模型。
     */
    private function matchesModelId(array $rule, string $modelId): bool
    {
        $modelIds = $this->normalizeStringList($rule['model_ids'] ?? []);
        $singleModelId = trim((string) ($rule['model_id'] ?? ''));
        if ($singleModelId !== '') {
            $modelIds[] = $singleModelId;
        }

        return in_array(trim($modelId), $modelIds, true);
    }

    /**
     * 将配置中的字符串列表归一化，去掉空值和多余空格。
     *
     * @return array<int, string>
     */
    private function normalizeStringList(mixed $items): array
    {
        if (! is_array($items)) {
            return [];
        }

        return array_values(array_unique(array_filter(
            array_map(static fn (mixed $item): string => trim((string) $item), $items),
            static fn (string $item): bool => $item !== ''
        )));
    }
}
