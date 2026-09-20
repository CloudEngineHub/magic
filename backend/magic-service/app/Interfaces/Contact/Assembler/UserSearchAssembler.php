<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Contact\Assembler;

use App\Infrastructure\Core\ValueObject\Page;

/**
 * 将用户查询结果投影为搜索接口响应。
 */
class UserSearchAssembler
{
    /**
     * @param array{total: int, list: array<int, array<string, mixed>>} $result
     * @return array{page: int, page_size: int, total: string, list: array<int, array{user_id: string, nickname: string, real_name: string, phone: string, organization_code: string, organization_name: string}>}
     */
    public static function createPageResponse(array $result, Page $page): array
    {
        return [
            'page' => $page->getPage(),
            'page_size' => $page->getPageNum(),
            'total' => (string) $result['total'],
            'list' => array_map(static function (array $user): array {
                return [
                    'user_id' => (string) ($user['user_id'] ?? ''),
                    'nickname' => (string) ($user['nickname'] ?? ''),
                    'real_name' => (string) ($user['real_name'] ?? ''),
                    'phone' => (string) ($user['phone'] ?? ''),
                    'organization_code' => (string) ($user['organization_code'] ?? ''),
                    'organization_name' => (string) ($user['organization_name'] ?? ''),
                ];
            }, $result['list']),
        ];
    }
}
