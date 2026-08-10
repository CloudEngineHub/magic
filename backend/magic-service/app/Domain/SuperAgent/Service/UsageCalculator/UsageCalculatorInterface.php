<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperAgent\Service\UsageCalculator;

use App\Domain\SuperMagic\Task\Service\UsageCalculator\UsageCalculatorInterface as SuperMagicUsageCalculatorInterface;

/**
 * Backward-compatibility shim for dtyq/magic-enterprise-service (pre-release),
 * which still references the pre-migration namespace.
 * Remove once magic-enterprise-service switches to the SuperMagic namespace.
 *
 * @deprecated use {@see SuperMagicUsageCalculatorInterface} instead
 */
interface UsageCalculatorInterface extends SuperMagicUsageCalculatorInterface
{
}
