<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Provider\Event;

use App\Domain\Provider\Entity\AiAbilityEntity;

/** AI 能力配置更新事件，携带更新前后的完整实体。 */
final readonly class AiAbilityUpdatedEvent
{
    public function __construct(
        public AiAbilityEntity $oldEntity,
        public AiAbilityEntity $newEntity,
    ) {
    }
}
