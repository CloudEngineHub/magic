<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\File\MagicFS\DTO\Response;

/** A single precise file-tree mutation. */
class FileTreeChangeDTO
{
    public int $revision = 0;

    public string $operation = '';

    public string $file_id = '';

    public string $parent_id = '';

    public string $old_parent_id = '';

    public string $name = '';

    public ?string $old_name = null;

    /** @var array<string, mixed> */
    public array $file = [];

    /**
     * @param array<string, mixed> $row
     */
    public static function fromRow(array $row): self
    {
        $dto = new self();
        // revision is the root_file_id-local cursor. change_id is an internal
        // audit identifier and must never leak into filesystem synchronization.
        $dto->revision = (int) ($row['revision'] ?? 0);
        $dto->operation = (string) ($row['operation'] ?? '');
        $dto->file_id = (string) ($row['file_id'] ?? '');
        $dto->parent_id = (string) ($row['parent_id'] ?? '');
        $dto->old_parent_id = (string) ($row['old_parent_id'] ?? '');
        $dto->name = (string) ($row['name'] ?? '');
        $dto->old_name = isset($row['old_name']) ? (string) $row['old_name'] : null;

        $snapshot = $row['file_snapshot'] ?? null;
        if (is_string($snapshot) && $snapshot !== '') {
            $decoded = json_decode($snapshot, true);
            if (is_array($decoded)) {
                $dto->file = $decoded;
            }
        } elseif (is_array($snapshot)) {
            $dto->file = $snapshot;
        }

        return $dto;
    }

    public function toArray(): array
    {
        return [
            'revision' => $this->revision,
            'operation' => $this->operation,
            'file_id' => $this->file_id,
            'parent_id' => $this->parent_id,
            'old_parent_id' => $this->old_parent_id,
            'name' => $this->name,
            'old_name' => $this->old_name,
            'file' => $this->file,
        ];
    }
}
