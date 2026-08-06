<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\File\MagicFS\DTO\Request;

use App\ErrorCode\MagicFSErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use Hyperf\HttpServer\Contract\RequestInterface;

class ListFilesRequestDTO
{
    public string $parent_id = '';

    public static function fromRequest(RequestInterface $request): self
    {
        $data = $request->all();

        $dto = new self();
        $dto->parent_id = trim((string) ($data['parent_id'] ?? ''));

        // parent_id 必填：根目录列表没有项目锚点，无法做权限校验，统一在入参校验层拒绝
        if ($dto->parent_id === '' || $dto->parent_id === '0') {
            ExceptionBuilder::throw(
                MagicFSErrorCode::PARENT_DIRECTORY_NOT_FOUND,
                'magicfs.parent_directory_not_found',
                ['parent_id' => $dto->parent_id]
            );
        }

        return $dto;
    }
}
