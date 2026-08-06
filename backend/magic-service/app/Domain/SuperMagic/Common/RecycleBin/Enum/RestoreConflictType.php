<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Common\RecycleBin\Enum;

enum RestoreConflictType: string
{
    case ParentMissing = 'parent_missing';
    case NameConflict = 'name_conflict';
    case ProjectMissing = 'project_missing';
    case DuplicateRestoreTarget = 'duplicate_restore_target';
}
