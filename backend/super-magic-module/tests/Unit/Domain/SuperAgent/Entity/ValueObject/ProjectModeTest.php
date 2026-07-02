<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Domain\SuperAgent\Entity\ValueObject;

use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\ProjectMode;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class ProjectModeTest extends TestCase
{
    public function testMicroAppIsValidProjectMode(): void
    {
        $this->assertSame(ProjectMode::MICRO_APP, ProjectMode::tryFrom('micro-app'));
        $this->assertContains('micro-app', ProjectMode::getAllModes());
        $this->assertSame('微应用开发模式', ProjectMode::MICRO_APP->getDescription());
    }
}
