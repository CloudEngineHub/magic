<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\File\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

class CopyFileRequestDTO extends AbstractRequestDTO
{
    /**
     * The ID of the target parent directory.
     */
    public string $targetParentId = '';

    /**
     * The ID of the previous file for positioning, 0=first position, -1=last position (default).
     */
    public string $preFileId = '-1';

    /**
     * The ID of the target project (optional, for cross-project copy).
     */
    public string $targetProjectId = '';

    /**
     * Array of source file IDs that should not overwrite when conflict occurs.
     * If current file ID is in this list and target path exists, generate a new target filename.
     */
    public array $keepBothFileIds = [];

    /**
     * Whether to recreate the source parent directory chain in the target project.
     */
    public bool $preserveParentPath = false;

    public function getTargetParentId(): string
    {
        return $this->targetParentId;
    }

    public function getPreFileId(): string
    {
        return $this->preFileId;
    }

    public function getTargetProjectId(): string
    {
        return $this->targetProjectId;
    }

    public function getKeepBothFileIds(): array
    {
        return $this->keepBothFileIds;
    }

    public function shouldPreserveParentPath(): bool
    {
        return $this->preserveParentPath;
    }

    /**
     * Get validation rules.
     */
    protected static function getHyperfValidationRules(): array
    {
        return [
            'target_parent_id' => 'nullable|string',
            'pre_file_id' => 'string', // -1表示末尾，0表示第一位，>0表示指定位置
            'target_project_id' => 'nullable|string',
            'keep_both_file_ids' => 'nullable|array',
            'keep_both_file_ids.*' => 'string',
            'preserve_parent_path' => 'nullable|boolean',
        ];
    }

    /**
     * Get custom error messages for validation failures.
     */
    protected static function getHyperfValidationMessage(): array
    {
        return [
            'target_parent_id.string' => 'Target parent ID must be a string',
            'pre_file_id.string' => 'Pre file ID must be a string',
            'target_project_id.string' => 'Target project ID must be a string',
            'keep_both_file_ids.array' => 'Keep both file IDs must be an array',
            'keep_both_file_ids.*.string' => 'Each keep both file ID must be a string',
            'preserve_parent_path.boolean' => 'Preserve parent path must be a boolean',
        ];
    }
}
