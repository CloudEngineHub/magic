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

    #[ErrorMessage('notification.actioned')]
    case ACTIONED = 35002;

    #[ErrorMessage('notification.expired')]
    case EXPIRED = 35003;

    #[ErrorMessage('notification.version_mismatch')]
    case VERSION_MISMATCH = 35004;

    #[ErrorMessage('notification.template_not_found')]
    case TEMPLATE_NOT_FOUND = 35010;

    #[ErrorMessage('notification.handler_unavailable')]
    case HANDLER_UNAVAILABLE = 35011;

    #[ErrorMessage('notification.event_dispatch_failed')]
    case EVENT_DISPATCH_FAILED = 35015;
}
