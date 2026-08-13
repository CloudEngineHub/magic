<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use Hyperf\Snowflake\Concern\Snowflake;

class MagicBaseTablePermissionModel extends AbstractModel
{
    use Snowflake;

    public bool $timestamps = false;

    protected ?string $table = 'magicbase_table_permissions';

    protected array $fillable = [
        'id',
        'organization_code',
        'table_id',
        'subject_type',
        'subject_id',
        'permission_level',
        'created_at',
        'updated_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'organization_code' => 'string',
        'table_id' => 'integer',
        'subject_type' => 'string',
        'subject_id' => 'string',
        'permission_level' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
