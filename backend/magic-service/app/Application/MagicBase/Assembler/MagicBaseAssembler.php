<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\Assembler;

use App\Application\MagicBase\DTO\ColumnPermissionRequestDTO;
use App\Application\MagicBase\DTO\CreateColumnRequestDTO;
use App\Application\MagicBase\DTO\CreateRowRequestDTO;
use App\Application\MagicBase\DTO\CreateTableRequestDTO;
use App\Application\MagicBase\DTO\QueryRowsRequestDTO;
use App\Application\MagicBase\DTO\RelationRequestDTO;
use App\Application\MagicBase\DTO\RowPermissionRequestDTO;
use App\Application\MagicBase\DTO\SubjectRequestDTO;
use App\Application\MagicBase\DTO\TablePermissionRequestDTO;
use App\Application\MagicBase\DTO\UpdateTableRequestDTO;
use App\Interfaces\MagicBase\DTO\CreateColumnRequest;
use App\Interfaces\MagicBase\DTO\CreateRelationRequest;
use App\Interfaces\MagicBase\DTO\CreateRowRequest;
use App\Interfaces\MagicBase\DTO\CreateTableRequest;
use App\Interfaces\MagicBase\DTO\QueryRowsRequest;
use App\Interfaces\MagicBase\DTO\UpdateTableRequest;

class MagicBaseAssembler
{
    public static function toCreateTableRequestDTO(CreateTableRequest $request): CreateTableRequestDTO
    {
        return new CreateTableRequestDTO(
            $request->getTableKey(),
            $request->getTableName(),
            $request->getColumns(),
            $request->getDynamicPermissions(),
            $request->getDescription(),
            $request->getProjectName(),
        );
    }

    public static function toUpdateTableRequestDTO(UpdateTableRequest $request): UpdateTableRequestDTO
    {
        return new UpdateTableRequestDTO(
            $request->getTableKey(),
            $request->getTableName(),
            $request->getDynamicPermissions(),
            $request->getDescription(),
        );
    }

    public static function toCreateRowRequestDTO(CreateRowRequest $request): CreateRowRequestDTO
    {
        return new CreateRowRequestDTO($request->getData(), $request->getSelect());
    }

    public static function toQueryRowsRequestDTO(QueryRowsRequest $request): QueryRowsRequestDTO
    {
        return new QueryRowsRequestDTO(
            $request->getFilter(),
            $request->getSort(),
            $request->getPage(),
            $request->getPageSize(),
            $request->getSelect(),
            $request->getIncludeTotal(),
        );
    }

    public static function toCreateColumnRequestDTO(CreateColumnRequest $request): CreateColumnRequestDTO
    {
        return CreateColumnRequestDTO::fromRequest(
            $request->getColumnKey(),
            $request->getColumnName(),
            $request->getDataType(),
            $request->getIsRequired(),
            $request->getDefaultValue(),
            $request->getDynamicPermission(),
        );
    }

    public static function toRelationRequestDTO(CreateRelationRequest $request): RelationRequestDTO
    {
        return RelationRequestDTO::fromArray($request->toArray());
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function toSubjectRequestDTO(array $payload): SubjectRequestDTO
    {
        return SubjectRequestDTO::fromArray($payload);
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function toTablePermissionRequestDTO(array $payload): TablePermissionRequestDTO
    {
        return TablePermissionRequestDTO::fromArray($payload);
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function toColumnPermissionRequestDTO(array $payload): ColumnPermissionRequestDTO
    {
        return ColumnPermissionRequestDTO::fromArray($payload);
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function toRowPermissionRequestDTO(array $payload): RowPermissionRequestDTO
    {
        return RowPermissionRequestDTO::fromArray($payload);
    }
}
