<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use Hyperf\Snowflake\Concern\Snowflake;

class MagicBaseProjectAdminModel extends AbstractModel
{
    use Snowflake;

    public bool $timestamps = false;

    protected ?string $table = 'magicbase_project_admins';

    protected array $fillable = [
        'id',
        'organization_code',
        'project_id',
        'subject_type',
        'subject_id',
        'created_at',
        'updated_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'organization_code' => 'string',
        'project_id' => 'integer',
        'subject_type' => 'string',
        'subject_id' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
