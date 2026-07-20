<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Kernel;

use App\Application\Kernel\DTO\GlobalConfig;
use App\Application\Kernel\Enum\MaintenanceType;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class GlobalConfigTest extends TestCase
{
    public function testDefaultMaintenanceTypeIsGlobalNotice(): void
    {
        $config = new GlobalConfig();

        $this->assertSame(MaintenanceType::GlobalNotice, $config->getMaintenanceType());
        $this->assertSame(MaintenanceType::GlobalNotice->value, $config->toArray()['maintenance_type']);
    }

    public function testMaintenanceTypeRoundTrip(): void
    {
        $config = GlobalConfig::fromArray([
            'is_maintenance' => true,
            'maintenance_type' => MaintenanceType::SiteClose->value,
            'maintenance_description' => 'unit test maintenance',
            'bootstrap_status' => 'legacy',
        ]);

        $this->assertSame(MaintenanceType::SiteClose, $config->getMaintenanceType());
        $this->assertSame([
            'is_maintenance' => true,
            'maintenance_type' => MaintenanceType::SiteClose->value,
            'maintenance_description' => 'unit test maintenance',
            'bootstrap_status' => 'legacy',
        ], $config->toArray());
    }

    public function testMissingOrInvalidStoredMaintenanceTypeFallsBackToGlobalNotice(): void
    {
        $missing = GlobalConfig::fromArray([]);
        $invalid = GlobalConfig::fromArray(['maintenance_type' => 'invalid']);

        $this->assertSame(MaintenanceType::GlobalNotice, $missing->getMaintenanceType());
        $this->assertSame(MaintenanceType::GlobalNotice, $invalid->getMaintenanceType());
    }
}
