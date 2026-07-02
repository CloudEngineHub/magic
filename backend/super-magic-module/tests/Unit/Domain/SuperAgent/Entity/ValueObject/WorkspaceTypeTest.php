<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Domain\SuperAgent\Entity\ValueObject;

use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\WorkspaceType;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class WorkspaceTypeTest extends TestCase
{
    public function testMicroAppIsValidInternalWorkspaceType(): void
    {
        $this->assertSame(WorkspaceType::MicroApp, WorkspaceType::tryFrom('micro-app'));
        $this->assertContains('micro-app', WorkspaceType::getAllTypes());
        $this->assertTrue(WorkspaceType::isValid('micro-app'));
    }

    public function testMicroAppIsNotPublicWorkspaceType(): void
    {
        $this->assertNotContains('micro-app', WorkspaceType::getPublicTypes());
    }
}
