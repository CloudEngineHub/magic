<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Infrastructure\Utils;

use App\ErrorCode\EventErrorCode;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\TaskEvent;

class TaskEventUtil
{
    public static function getRemindTaskEventByCode(int $code): string
    {
        switch ($code) {
            case EventErrorCode::EVENT_TASK_PENDING->value:
                return TaskEvent::SUSPENDED->value;
            case EventErrorCode::EVENT_TASK_STOP->value:
                return TaskEvent::TERMINATED->value;
            default:
                return '';
        }
    }
}
