<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Kernel\Enum;

enum MaintenanceType: string
{
    case GlobalNotice = 'global_notice';
    case SiteClose = 'site_close';

    public static function default(): self
    {
        return self::GlobalNotice;
    }

    /**
     * @return string[]
     */
    public static function values(): array
    {
        return array_map(static fn (self $case) => $case->value, self::cases());
    }
}
