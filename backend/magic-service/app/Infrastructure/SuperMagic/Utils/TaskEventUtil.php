<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\SuperMagic\Utils;

use App\Domain\SuperMagic\Task\Entity\ValueObject\TaskEvent;
use App\ErrorCode\EventErrorCode;

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
