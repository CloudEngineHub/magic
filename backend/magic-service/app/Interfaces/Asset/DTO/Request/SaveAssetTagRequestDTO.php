<?php

declare(strict_types=1);

namespace App\Interfaces\Asset\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

class SaveAssetTagRequestDTO extends AbstractRequestDTO
{
    public string $name = '';
    public string $nodeType = 'tag';
    public int $parentId = 0;

    public function setName(mixed $value): void { $this->name = trim((string) $value); }
    public function setNodeType(mixed $value): void { $this->nodeType = in_array((string) $value, ['group', 'tag'], true) ? (string) $value : 'tag'; }
    public function setParentId(mixed $value): void { $this->parentId = max(0, (int) ($value ?? 0)); }
    public function getName(): string { return $this->name; }
    public function getNodeType(): string { return $this->nodeType; }
    public function getParentId(): int { return $this->parentId; }

    protected static function getHyperfValidationRules(): array
    {
        return ['name' => 'required|string|max:100', 'node_type' => 'nullable|string|in:group,tag', 'parent_id' => 'nullable|integer|min:0'];
    }
}
