<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Interfaces\Share\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

class BatchCopySharedFilesRequestDTO extends AbstractRequestDTO
{
    public array $fileIds = [];

    public string $targetProjectId = '';

    public string $targetParentId = '';

    public string $preFileId = '';

    public array $keepBothFileIds = [];

    public bool $preserveParentPath = false;

    public string $pwd = '';

    public function getFileIds(): array
    {
        return $this->fileIds;
    }

    public function getTargetProjectId(): string
    {
        return $this->targetProjectId;
    }

    public function getTargetParentId(): string
    {
        return $this->targetParentId;
    }

    public function getPreFileId(): string
    {
        return $this->preFileId;
    }

    public function getKeepBothFileIds(): array
    {
        return $this->keepBothFileIds;
    }

    public function shouldPreserveParentPath(): bool
    {
        return $this->preserveParentPath;
    }

    public function getPassword(): string
    {
        return $this->pwd;
    }

    protected static function getHyperfValidationRules(): array
    {
        return [
            'file_ids' => 'required|array|min:1',
            'file_ids.*' => 'required|string',
            'target_project_id' => 'required|string',
            'target_parent_id' => 'nullable|string',
            'pre_file_id' => 'nullable|string',
            'keep_both_file_ids' => 'nullable|array',
            'keep_both_file_ids.*' => 'string',
            'preserve_parent_path' => 'nullable|boolean',
            'pwd' => 'nullable|string|max:100',
        ];
    }

    protected static function getHyperfValidationMessage(): array
    {
        return [
            'file_ids.required' => 'File IDs are required',
            'file_ids.array' => 'File IDs must be an array',
            'file_ids.min' => 'At least one file ID is required',
            'file_ids.*.required' => 'Each file ID is required',
            'file_ids.*.string' => 'Each file ID must be a string',
            'target_project_id.required' => 'Target project ID is required',
            'target_project_id.string' => 'Target project ID must be a string',
            'target_parent_id.string' => 'Target parent ID must be a string',
            'pre_file_id.string' => 'Previous file ID must be a string',
            'keep_both_file_ids.array' => 'Keep both file IDs must be an array',
            'keep_both_file_ids.*.string' => 'Each keep both file ID must be a string',
            'preserve_parent_path.boolean' => 'Preserve parent path must be a boolean',
            'pwd.string' => 'Password must be a string',
            'pwd.max' => 'Password cannot exceed 100 characters',
        ];
    }
}
