<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Common\Share\DTO\Request;

use Hyperf\HttpServer\Contract\RequestInterface;

class GetShareFilesV2RequestDTO
{
    public const DEFAULT_PAGE_SIZE = 100;

    public const MAX_PAGE_SIZE = 1000;

    public int $pageSize;

    public array $nextParentIds;

    public string $password;

    public function __construct(array $data = [])
    {
        $size = (int) ($data['page_size'] ?? self::DEFAULT_PAGE_SIZE);
        $this->pageSize = max(1, min($size ?: self::DEFAULT_PAGE_SIZE, self::MAX_PAGE_SIZE));
        $this->password = (string) ($data['pwd'] ?? $data['password'] ?? '');
        $value = $data['next_parent_ids'] ?? [];
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_array($decoded) ? $decoded : [];
        }
        $this->nextParentIds = [];
        foreach (is_array($value) ? $value : [] as $item) {
            if (! is_array($item) || ! isset($item['parent_id'])) {
                continue;
            }
            $parentId = trim((string) $item['parent_id']);
            if ($parentId === '' || (int) $parentId <= 0) {
                continue;
            }
            $this->nextParentIds[] = [
                'parent_id' => $parentId,
                'after_sort' => isset($item['after_sort']) ? (int) $item['after_sort'] : null,
                'after_file_id' => isset($item['after_file_id']) ? (string) $item['after_file_id'] : null,
            ];
        }
    }

    public static function fromRequest(RequestInterface $request): self
    {
        return new self($request->all());
    }
}
