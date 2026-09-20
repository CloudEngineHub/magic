<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Provider\Assembler;

use App\Infrastructure\Core\ValueObject\Page;

/**
 * 将服务商配置查询结果投影为搜索接口响应。
 */
class ProviderConfigSearchAssembler
{
    /**
     * @param array{total: int, list: array<int, array<string, mixed>>} $result
     * @return array{page: int, page_size: int, total: string, list: array<int, array<string, string>>}
     */
    public static function createPageResponse(array $result, Page $page): array
    {
        return [
            'page' => $page->getPage(),
            'page_size' => $page->getPageNum(),
            'total' => (string) $result['total'],
            'list' => array_map(static function (array $providerConfig): array {
                $response = [
                    'service_provider_config_id' => (string) ($providerConfig['service_provider_config_id'] ?? ''),
                ];

                foreach (['service_provider_id', 'provider_name', 'provider_alias'] as $field) {
                    if (array_key_exists($field, $providerConfig)) {
                        $response[$field] = (string) $providerConfig[$field];
                    }
                }

                return $response;
            }, $result['list']),
        ];
    }
}
