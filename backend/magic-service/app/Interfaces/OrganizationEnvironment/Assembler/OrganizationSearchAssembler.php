<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\OrganizationEnvironment\Assembler;

use App\Domain\OrganizationEnvironment\Entity\OrganizationEntity;
use App\Infrastructure\Core\ValueObject\Page;

/**
 * 将组织实体投影为搜索接口响应。
 */
class OrganizationSearchAssembler
{
    /**
     * @param array{total: int, list: OrganizationEntity[]} $result
     * @return array{page: int, page_size: int, total: string, list: array<int, array{organization_code: string, organization_name: string}>}
     */
    public static function createPageResponse(array $result, Page $page): array
    {
        return [
            'page' => $page->getPage(),
            'page_size' => $page->getPageNum(),
            'total' => (string) $result['total'],
            'list' => array_map(static fn (OrganizationEntity $organization): array => [
                'organization_code' => $organization->getMagicOrganizationCode(),
                'organization_name' => $organization->getName(),
            ], $result['list']),
        ];
    }
}
