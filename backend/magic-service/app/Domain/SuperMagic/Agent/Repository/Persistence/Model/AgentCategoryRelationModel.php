<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Agent\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use Carbon\Carbon;
use Hyperf\Database\Model\SoftDeletes;

/**
 * @property int $id
 * @property string $organization_code
 * @property string $relation_type
 * @property int $relation_id
 * @property int $category_id
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property null|Carbon $deleted_at
 */
class AgentCategoryRelationModel extends AbstractModel
{
    use SoftDeletes;

    protected ?string $table = 'magic_super_magic_agent_category_relations';

    protected array $fillable = [
        'id',
        'organization_code',
        'relation_type',
        'relation_id',
        'category_id',
    ];

    protected array $casts = [
        'id' => 'integer',
        'organization_code' => 'string',
        'relation_type' => 'string',
        'relation_id' => 'integer',
        'category_id' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];
}
