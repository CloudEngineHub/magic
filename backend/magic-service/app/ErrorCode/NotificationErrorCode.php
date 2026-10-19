<?php

declare(strict_types=1);

namespace App\ErrorCode;

use App\Infrastructure\Core\Exception\Annotation\ErrorMessage;

/** Notification user API errors: 35000-35099. */
enum NotificationErrorCode: int
{
    #[ErrorMessage('notification.not_found')]
    case NOT_FOUND = 35000;

    #[ErrorMessage('notification.withdrawn')]
    case WITHDRAWN = 35001;
}
