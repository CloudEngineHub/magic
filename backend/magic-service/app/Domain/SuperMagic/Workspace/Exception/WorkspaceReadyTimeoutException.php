<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Workspace\Exception;

use RuntimeException;

/**
 * Exception thrown when workspace is not ready within timeout.
 */
class WorkspaceReadyTimeoutException extends RuntimeException
{
}
