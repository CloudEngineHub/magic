# Recycle Bin File Restore Conflict Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace silent fallback logic in `restoreFile` with explicit conflict detection (preview endpoint) and user-driven resolution strategies, removing auto-rename logic entirely.

**Architecture:** Two-phase API (preview → restore). Preview is read-only and reports `parent_missing` / `name_conflict` per file. Restore re-checks inside a transaction and blocks on any unresolved conflict. Strategy is passed per-resource × per-conflict-type via `conflict_resolutions` map.

**Tech Stack:** PHP 8.1+, Hyperf, PHPUnit, `vendor/dtyq/super-magic-module`

---

## File Map

All paths are relative to `vendor/dtyq/super-magic-module/`.

| File | Action | Responsibility |
|---|---|---|
| `src/Domain/RecycleBin/Enum/RestoreConflictType.php` | Create | Enum: `parent_missing`, `name_conflict` |
| `src/Domain/RecycleBin/Enum/RestoreConflictResolution.php` | Create | Enum: `restore_to_root`, `overwrite`, `skip` |
| `src/Application/RecycleBin/DTO/RestoreConflictDTO.php` | Create | Carries one conflict's type + metadata |
| `src/Application/RecycleBin/DTO/RestorePreviewItemDTO.php` | Create | One item in preview response |
| `src/Application/RecycleBin/DTO/RestorePreviewRequestDTO.php` | Create | Preview request (same shape as RestoreRequestDTO minus resolutions) |
| `src/Application/RecycleBin/DTO/RestorePreviewResponseDTO.php` | Create | `items_with_conflict` + `items_no_conflict` |
| `src/Application/RecycleBin/DTO/RestoreRequestDTO.php` | Modify | Add optional `conflict_resolutions` field |
| `src/Domain/RecycleBin/Service/RecycleBinRestoreDomainService.php` | Modify | Delete 3 methods; rewrite `restoreFile`; add `previewFileConflicts`; thread `conflict_resolutions` |
| `src/Application/RecycleBin/Service/RecycleBinAppService.php` | Modify | Add `previewRestore`; thread resolutions into `restore` |
| `src/Interfaces/RecycleBin/RecycleBinApi.php` | Modify | Add `previewRestore` controller method |
| `config/routes-v1/recycle-bin.php` | Modify | Register `POST /api/v1/recycle-bin/restore/preview` |
| `storage/languages/zh_CN/recycle_bin.php` | Modify | Add conflict error messages |
| `storage/languages/en_US/recycle_bin.php` | Modify | Add conflict error messages |
| `tests/Unit/Domain/RecycleBin/Service/RecycleBinRestoreDomainServiceTest.php` | Create | Unit tests for preview + restore logic |

---

## Task 1: Conflict Enums

**Files:**
- Create: `src/Domain/RecycleBin/Enum/RestoreConflictType.php`
- Create: `src/Domain/RecycleBin/Enum/RestoreConflictResolution.php`

- [ ] **Step 1: Create `RestoreConflictType`**

```php
<?php

declare(strict_types=1);

namespace Dtyq\SuperMagic\Domain\RecycleBin\Enum;

enum RestoreConflictType: string
{
    case ParentMissing = 'parent_missing';
    case NameConflict = 'name_conflict';
}
```

Save to `src/Domain/RecycleBin/Enum/RestoreConflictType.php`.

- [ ] **Step 2: Create `RestoreConflictResolution`**

```php
<?php

declare(strict_types=1);

namespace Dtyq\SuperMagic\Domain\RecycleBin\Enum;

enum RestoreConflictResolution: string
{
    /** Restore to project root directory — for parent_missing only */
    case RestoreToRoot = 'restore_to_root';
    /** Soft-delete the conflicting file/directory (self only, no recursive) — for name_conflict only */
    case Overwrite = 'overwrite';
    /** Do not restore this resource — valid for both conflict types */
    case Skip = 'skip';

    public static function validForParentMissing(): array
    {
        return [self::RestoreToRoot, self::Skip];
    }

    public static function validForNameConflict(): array
    {
        return [self::Overwrite, self::Skip];
    }
}
```

Save to `src/Domain/RecycleBin/Enum/RestoreConflictResolution.php`.

- [ ] **Step 3: Commit**

```bash
git add src/Domain/RecycleBin/Enum/RestoreConflictType.php \
        src/Domain/RecycleBin/Enum/RestoreConflictResolution.php
git commit -m "feat(recycle-bin): add RestoreConflictType and RestoreConflictResolution enums"
```

---

## Task 2: Preview DTOs

**Files:**
- Create: `src/Application/RecycleBin/DTO/RestoreConflictDTO.php`
- Create: `src/Application/RecycleBin/DTO/RestorePreviewItemDTO.php`
- Create: `src/Application/RecycleBin/DTO/RestorePreviewRequestDTO.php`
- Create: `src/Application/RecycleBin/DTO/RestorePreviewResponseDTO.php`

- [ ] **Step 1: Create `RestoreConflictDTO`**

```php
<?php

declare(strict_types=1);

namespace Dtyq\SuperMagic\Application\RecycleBin\DTO;

use Dtyq\SuperMagic\Domain\RecycleBin\Enum\RestoreConflictType;

class RestoreConflictDTO
{
    public function __construct(
        public readonly RestoreConflictType $type,
        /** For parent_missing: the original parent file_id (may no longer exist) */
        public readonly ?int $originalParentId = null,
        /** For name_conflict: the file_id of the conflicting entry at the target location */
        public readonly ?int $existingFileId = null,
        /** For name_conflict: whether the conflicting entry is a directory */
        public readonly ?bool $existingIsDirectory = null,
    ) {}

    public function toArray(): array
    {
        $data = ['type' => $this->type->value];

        if ($this->type === RestoreConflictType::ParentMissing) {
            $data['original_parent_id'] = $this->originalParentId !== null
                ? (string) $this->originalParentId
                : null;
        }

        if ($this->type === RestoreConflictType::NameConflict) {
            $data['existing_file_id'] = $this->existingFileId !== null
                ? (string) $this->existingFileId
                : null;
            $data['existing_is_directory'] = $this->existingIsDirectory;
        }

        return $data;
    }
}
```

- [ ] **Step 2: Create `RestorePreviewItemDTO`**

```php
<?php

declare(strict_types=1);

namespace Dtyq\SuperMagic\Application\RecycleBin\DTO;

class RestorePreviewItemDTO
{
    public function __construct(
        public readonly string $resourceId,
        public readonly string $resourceName,
        public readonly bool $isDirectory,
        public readonly ?RestoreConflictDTO $conflict = null,
    ) {}

    public function hasConflict(): bool
    {
        return $this->conflict !== null;
    }

    public function toArray(): array
    {
        $data = [
            'resource_id'   => $this->resourceId,
            'resource_name' => $this->resourceName,
            'is_directory'  => $this->isDirectory,
        ];

        if ($this->conflict !== null) {
            $data['conflict'] = $this->conflict->toArray();
        }

        return $data;
    }
}
```

- [ ] **Step 3: Create `RestorePreviewRequestDTO`**

```php
<?php

declare(strict_types=1);

namespace Dtyq\SuperMagic\Application\RecycleBin\DTO;

use Dtyq\SuperMagic\Domain\RecycleBin\Enum\RecycleBinResourceType;
use Hyperf\HttpServer\Contract\RequestInterface;
use InvalidArgumentException;
use ValueError;

use function Hyperf\Translation\trans;

class RestorePreviewRequestDTO
{
    private array $resourceIds = [];

    private RecycleBinResourceType $resourceType;

    public function __construct(array $data)
    {
        if (! isset($data['resource_ids']) || ! is_array($data['resource_ids'])) {
            throw new InvalidArgumentException(trans('recycle_bin.validation.resource_ids_must_be_array'));
        }

        $this->resourceIds = array_map(fn ($id) => (string) $id, $data['resource_ids']);

        if (empty($this->resourceIds)) {
            throw new InvalidArgumentException(trans('recycle_bin.validation.resource_ids_empty'));
        }

        if (! isset($data['resource_type'])) {
            throw new InvalidArgumentException(trans('recycle_bin.validation.resource_type_required'));
        }

        try {
            $this->resourceType = RecycleBinResourceType::from((int) $data['resource_type']);
        } catch (ValueError $e) {
            throw new InvalidArgumentException(trans('recycle_bin.validation.resource_type_invalid'));
        }
    }

    public static function fromRequest(RequestInterface $request): self
    {
        return new self($request->all());
    }

    public function getResourceIds(): array
    {
        return $this->resourceIds;
    }

    public function getResourceType(): RecycleBinResourceType
    {
        return $this->resourceType;
    }
}
```

- [ ] **Step 4: Create `RestorePreviewResponseDTO`**

```php
<?php

declare(strict_types=1);

namespace Dtyq\SuperMagic\Application\RecycleBin\DTO;

class RestorePreviewResponseDTO
{
    /** @var RestorePreviewItemDTO[] */
    private array $itemsWithConflict = [];

    /** @var RestorePreviewItemDTO[] */
    private array $itemsNoConflict = [];

    public function __construct(array $itemsWithConflict, array $itemsNoConflict)
    {
        $this->itemsWithConflict = $itemsWithConflict;
        $this->itemsNoConflict   = $itemsNoConflict;
    }

    public function toArray(): array
    {
        return [
            'items_with_conflict' => array_map(
                fn (RestorePreviewItemDTO $item) => $item->toArray(),
                $this->itemsWithConflict
            ),
            'items_no_conflict' => array_map(
                fn (RestorePreviewItemDTO $item) => $item->toArray(),
                $this->itemsNoConflict
            ),
        ];
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/Application/RecycleBin/DTO/RestoreConflictDTO.php \
        src/Application/RecycleBin/DTO/RestorePreviewItemDTO.php \
        src/Application/RecycleBin/DTO/RestorePreviewRequestDTO.php \
        src/Application/RecycleBin/DTO/RestorePreviewResponseDTO.php
git commit -m "feat(recycle-bin): add preview DTOs for conflict detection"
```

---

## Task 3: Extend `RestoreRequestDTO` with `conflict_resolutions`

**Files:**
- Modify: `src/Application/RecycleBin/DTO/RestoreRequestDTO.php`

- [ ] **Step 1: Add `conflict_resolutions` field**

In `RestoreRequestDTO`, add:

```php
/** @var array<string, array<string, string>> resource_id → [conflict_type → resolution] */
private array $conflictResolutions = [];
```

Add parsing in `__construct` after the existing `resource_type` parsing:

```php
if (isset($data['conflict_resolutions']) && is_array($data['conflict_resolutions'])) {
    $this->conflictResolutions = $data['conflict_resolutions'];
}
```

Add getter:

```php
/**
 * Returns the conflict resolution map.
 * Shape: [ 'resource_id' => [ 'parent_missing' => 'restore_to_root', 'name_conflict' => 'overwrite' ] ]
 *
 * @return array<string, array<string, string>>
 */
public function getConflictResolutions(): array
{
    return $this->conflictResolutions;
}
```

Update `toArray()`:

```php
public function toArray(): array
{
    return [
        'resource_ids'         => $this->resourceIds,
        'resource_type'        => $this->resourceType->value,
        'conflict_resolutions' => $this->conflictResolutions,
    ];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Application/RecycleBin/DTO/RestoreRequestDTO.php
git commit -m "feat(recycle-bin): add conflict_resolutions to RestoreRequestDTO"
```

---

## Task 4: Language Files

**Files:**
- Modify: `storage/languages/zh_CN/recycle_bin.php`
- Modify: `storage/languages/en_US/recycle_bin.php`

- [ ] **Step 1: Add to `zh_CN/recycle_bin.php`**

Inside the `'restore'` array, add after existing `'parent_directory_missing'` entry:

```php
'file_parent_missing'             => '父级目录不存在，请选择恢复到根目录或跳过',
'file_name_conflict'              => '目标位置已存在同名文件或目录，请选择覆盖或跳过',
'file_restore_to_root_failed'     => '无法找到项目根目录，文件恢复失败',
'file_conflict_requires_decision' => '文件恢复存在冲突，请提供解决策略',
```

- [ ] **Step 2: Add to `en_US/recycle_bin.php`**

Inside the `'restore'` array:

```php
'file_parent_missing'             => 'Parent directory does not exist. Choose to restore to root or skip',
'file_name_conflict'              => 'A file or directory with the same name already exists at the target location. Choose to overwrite or skip',
'file_restore_to_root_failed'     => 'Cannot find the project root directory. File restore failed',
'file_conflict_requires_decision' => 'File restore has conflicts. Provide a resolution strategy',
```

- [ ] **Step 3: Commit**

```bash
git add storage/languages/zh_CN/recycle_bin.php \
        storage/languages/en_US/recycle_bin.php
git commit -m "feat(recycle-bin): add conflict-related i18n messages"
```

---

## Task 5: Write Tests (TDD — write before implementing domain logic)

**Files:**
- Create: `tests/Unit/Domain/RecycleBin/Service/RecycleBinRestoreDomainServiceTest.php`

- [ ] **Step 1: Create test file**

```php
<?php

declare(strict_types=1);

namespace Dtyq\SuperMagic\Tests\Unit\Domain\RecycleBin\Service;

use Dtyq\SuperMagic\Domain\RecycleBin\Entity\RecycleBinEntity;
use Dtyq\SuperMagic\Domain\RecycleBin\Enum\RecycleBinResourceType;
use Dtyq\SuperMagic\Domain\RecycleBin\Repository\Facade\RecycleBinRepositoryInterface;
use Dtyq\SuperMagic\Domain\RecycleBin\Service\RecycleBinRestoreDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TaskFileEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectMemberRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\TaskFileRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\TopicRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\WorkspaceRepositoryInterface;
use Hyperf\Logger\LoggerFactory;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use RuntimeException;

/**
 * @internal
 */
class RecycleBinRestoreDomainServiceTest extends TestCase
{
    private RecycleBinRepositoryInterface|MockObject $recycleBinRepo;
    private TaskFileRepositoryInterface|MockObject $taskFileRepo;
    private ProjectRepositoryInterface|MockObject $projectRepo;
    private TopicRepositoryInterface|MockObject $topicRepo;
    private WorkspaceRepositoryInterface|MockObject $workspaceRepo;
    private ProjectMemberRepositoryInterface|MockObject $projectMemberRepo;
    private RecycleBinRestoreDomainService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->recycleBinRepo    = $this->createMock(RecycleBinRepositoryInterface::class);
        $this->taskFileRepo      = $this->createMock(TaskFileRepositoryInterface::class);
        $this->projectRepo       = $this->createMock(ProjectRepositoryInterface::class);
        $this->topicRepo         = $this->createMock(TopicRepositoryInterface::class);
        $this->workspaceRepo     = $this->createMock(WorkspaceRepositoryInterface::class);
        $this->projectMemberRepo = $this->createMock(ProjectMemberRepositoryInterface::class);

        $logger        = $this->createMock(LoggerInterface::class);
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn($logger);

        $this->service = new RecycleBinRestoreDomainService(
            $this->recycleBinRepo,
            $this->workspaceRepo,
            $this->projectRepo,
            $this->topicRepo,
            $this->taskFileRepo,
            $this->projectMemberRepo,
            $loggerFactory
        );
    }

    // ----------------------------------------------------------------
    // previewFileConflicts — parent_missing
    // ----------------------------------------------------------------

    public function testPreviewReturnsParentMissingWhenParentNotFound(): void
    {
        $fileId   = 100;
        $parentId = 200;

        $entity = $this->makeRecycleBinEntity($fileId);
        $file   = $this->makeFileEntity($fileId, $parentId, 'report.docx', projectId: 1);

        $this->recycleBinRepo->method('findLatestByResourceIds')->willReturn([$entity]);
        $this->taskFileRepo->method('getByIdWithTrash')
            ->willReturnMap([[$fileId, $file], [$parentId, null]]);

        $result = $this->service->previewFileConflicts([(string) $fileId], 'user1');

        $this->assertCount(1, $result['items_with_conflict']);
        $this->assertCount(0, $result['items_no_conflict']);

        $item = $result['items_with_conflict'][0];
        $this->assertEquals('parent_missing', $item->conflict->type->value);
        $this->assertEquals($parentId, $item->conflict->originalParentId);
    }

    public function testPreviewReturnsNameConflictWhenSameNameExists(): void
    {
        $fileId     = 101;
        $parentId   = 300;
        $conflictId = 999;

        $entity   = $this->makeRecycleBinEntity($fileId);
        $file     = $this->makeFileEntity($fileId, $parentId, 'imgs', projectId: 1, isDirectory: true);
        $parent   = $this->makeFileEntity($parentId, null, 'parent', projectId: 1, isDirectory: true);
        $conflict = $this->makeFileEntity($conflictId, $parentId, 'imgs', projectId: 1, isDirectory: true);

        $this->recycleBinRepo->method('findLatestByResourceIds')->willReturn([$entity]);
        $this->taskFileRepo->method('getByIdWithTrash')
            ->willReturnMap([[$fileId, $file], [$parentId, $parent]]);
        $this->taskFileRepo->method('getByProjectParentAndName')->willReturn($conflict);

        $result = $this->service->previewFileConflicts([(string) $fileId], 'user1');

        $this->assertCount(1, $result['items_with_conflict']);
        $item = $result['items_with_conflict'][0];
        $this->assertEquals('name_conflict', $item->conflict->type->value);
        $this->assertEquals($conflictId, $item->conflict->existingFileId);
        $this->assertTrue($item->conflict->existingIsDirectory);
    }

    public function testPreviewReturnsNoConflictWhenParentExistsAndNoNameConflict(): void
    {
        $fileId   = 102;
        $parentId = 300;

        $entity = $this->makeRecycleBinEntity($fileId);
        $file   = $this->makeFileEntity($fileId, $parentId, 'test.txt', projectId: 1);
        $parent = $this->makeFileEntity($parentId, null, 'docs', projectId: 1, isDirectory: true);

        $this->recycleBinRepo->method('findLatestByResourceIds')->willReturn([$entity]);
        $this->taskFileRepo->method('getByIdWithTrash')
            ->willReturnMap([[$fileId, $file], [$parentId, $parent]]);
        $this->taskFileRepo->method('getByProjectParentAndName')->willReturn(null);

        $result = $this->service->previewFileConflicts([(string) $fileId], 'user1');

        $this->assertCount(0, $result['items_with_conflict']);
        $this->assertCount(1, $result['items_no_conflict']);
    }

    public function testPreviewParentMissingDoesNotCheckNameConflict(): void
    {
        $fileId   = 103;
        $parentId = 200;

        $entity = $this->makeRecycleBinEntity($fileId);
        $file   = $this->makeFileEntity($fileId, $parentId, 'data.csv', projectId: 1);

        $this->recycleBinRepo->method('findLatestByResourceIds')->willReturn([$entity]);
        $this->taskFileRepo->method('getByIdWithTrash')
            ->willReturnMap([[$fileId, $file], [$parentId, null]]);

        // getByProjectParentAndName must NOT be called when parent is missing
        $this->taskFileRepo->expects($this->never())->method('getByProjectParentAndName');

        $result = $this->service->previewFileConflicts([(string) $fileId], 'user1');

        $this->assertEquals('parent_missing', $result['items_with_conflict'][0]->conflict->type->value);
    }

    // ----------------------------------------------------------------
    // previewFileConflicts — non-File resource_type (placeholder)
    // ----------------------------------------------------------------

    public function testPreviewNonFileTypeReturnsAllAsNoConflict(): void
    {
        $result = $this->service->previewFileConflicts([], 'user1');

        $this->assertArrayHasKey('items_with_conflict', $result);
        $this->assertArrayHasKey('items_no_conflict', $result);
        $this->assertCount(0, $result['items_with_conflict']);
    }

    // ----------------------------------------------------------------
    // restoreFile — blocks when conflict has no resolution
    // ----------------------------------------------------------------

    public function testRestoreFileThrowsWhenParentMissingAndNoResolution(): void
    {
        $fileId   = 100;
        $parentId = 200;

        $entity = $this->makeRecycleBinEntity($fileId);
        $file   = $this->makeDeletedFileEntity($fileId, $parentId, 'report.docx', projectId: 1);

        $this->recycleBinRepo->method('findLatestByResourceIds')->willReturn([$entity]);
        $this->taskFileRepo->method('getByIdWithTrash')
            ->willReturnMap([[$fileId, $file], [$parentId, null]]);

        // No resolutions passed
        $result = $this->service->restoreBatch([$fileId], RecycleBinResourceType::File, 'user1', []);

        $this->assertCount(0, $result['succeeded']);
        $this->assertCount(1, $result['failed']);
    }

    public function testRestoreFileThrowsWhenParentMissingAndSkipResolution(): void
    {
        $fileId   = 100;
        $parentId = 200;

        $entity = $this->makeRecycleBinEntity($fileId);
        $file   = $this->makeDeletedFileEntity($fileId, $parentId, 'report.docx', projectId: 1);

        $this->recycleBinRepo->method('findLatestByResourceIds')->willReturn([$entity]);
        $this->taskFileRepo->method('getByIdWithTrash')
            ->willReturnMap([[$fileId, $file], [$parentId, null]]);

        $result = $this->service->restoreBatch(
            [$fileId],
            RecycleBinResourceType::File,
            'user1',
            [(string) $fileId => ['parent_missing' => 'skip']]
        );

        $this->assertCount(0, $result['succeeded']);
        $this->assertCount(1, $result['failed']);
    }

    public function testRestoreFileThrowsWhenNameConflictAndNoResolution(): void
    {
        $fileId     = 101;
        $parentId   = 300;
        $conflictId = 999;

        $entity   = $this->makeRecycleBinEntity($fileId);
        $file     = $this->makeDeletedFileEntity($fileId, $parentId, 'imgs', projectId: 1, isDirectory: true);
        $parent   = $this->makeFileEntity($parentId, null, 'docs', projectId: 1, isDirectory: true);
        $conflict = $this->makeFileEntity($conflictId, $parentId, 'imgs', projectId: 1, isDirectory: true);

        $this->recycleBinRepo->method('findLatestByResourceIds')->willReturn([$entity]);
        $this->taskFileRepo->method('getByIdWithTrash')
            ->willReturnMap([[$fileId, $file], [$parentId, $parent]]);
        $this->taskFileRepo->method('getByProjectParentAndName')->willReturn($conflict);

        $result = $this->service->restoreBatch(
            [$fileId],
            RecycleBinResourceType::File,
            'user1',
            []
        );

        $this->assertCount(0, $result['succeeded']);
        $this->assertCount(1, $result['failed']);
    }

    // ----------------------------------------------------------------
    // restoreFile — restore_to_root then name_conflict (critical scenario)
    // ----------------------------------------------------------------

    public function testRestoreToRootThenNameConflictOverwrite(): void
    {
        $fileId     = 100;
        $parentId   = 200;
        $rootId     = 1;
        $conflictId = 888;

        $entity   = $this->makeRecycleBinEntity($fileId);
        $file     = $this->makeDeletedFileEntity($fileId, $parentId, 'report.docx', projectId: 5);
        $root     = $this->makeFileEntity($rootId, null, '/', projectId: 5, isDirectory: true);
        $conflict = $this->makeFileEntity($conflictId, $rootId, 'report.docx', projectId: 5);

        $this->recycleBinRepo->method('findLatestByResourceIds')->willReturn([$entity]);
        $this->recycleBinRepo->method('deleteById')->willReturn(true);

        $this->taskFileRepo->method('getByIdWithTrash')
            ->willReturnMap([[$fileId, $file], [$parentId, null]]);
        $this->taskFileRepo->method('findRootDirectoryByProjectId')->with(5)->willReturn($root);
        $this->taskFileRepo->method('getByProjectParentAndName')
            ->with(5, $rootId, 'report.docx')
            ->willReturn($conflict);
        $this->taskFileRepo->expects($this->once())
            ->method('deleteById')
            ->with($conflictId, false);
        $this->taskFileRepo->method('restoreFile')->with($fileId);
        $this->taskFileRepo->method('getById')->with($fileId)->willReturn(
            $this->makeFileEntity($fileId, $rootId, 'report.docx', projectId: 5)
        );
        $this->taskFileRepo->method('updateById')->willReturn(true);

        $result = $this->service->restoreBatch(
            [$fileId],
            RecycleBinResourceType::File,
            'user1',
            [(string) $fileId => ['parent_missing' => 'restore_to_root', 'name_conflict' => 'overwrite']]
        );

        $this->assertCount(1, $result['succeeded']);
        $this->assertCount(0, $result['failed']);
    }

    public function testRestoreToRootThenNameConflictMissingResolutionFails(): void
    {
        $fileId   = 100;
        $parentId = 200;
        $rootId   = 1;

        $entity   = $this->makeRecycleBinEntity($fileId);
        $file     = $this->makeDeletedFileEntity($fileId, $parentId, 'report.docx', projectId: 5);
        $root     = $this->makeFileEntity($rootId, null, '/', projectId: 5, isDirectory: true);
        $conflict = $this->makeFileEntity(888, $rootId, 'report.docx', projectId: 5);

        $this->recycleBinRepo->method('findLatestByResourceIds')->willReturn([$entity]);
        $this->taskFileRepo->method('getByIdWithTrash')
            ->willReturnMap([[$fileId, $file], [$parentId, null]]);
        $this->taskFileRepo->method('findRootDirectoryByProjectId')->willReturn($root);
        $this->taskFileRepo->method('getByProjectParentAndName')->willReturn($conflict);

        // Only parent_missing resolved, name_conflict not provided
        $result = $this->service->restoreBatch(
            [$fileId],
            RecycleBinResourceType::File,
            'user1',
            [(string) $fileId => ['parent_missing' => 'restore_to_root']]
        );

        $this->assertCount(0, $result['succeeded']);
        $this->assertCount(1, $result['failed']);
    }

    // ----------------------------------------------------------------
    // restoreFile — batch partial success
    // ----------------------------------------------------------------

    public function testBatchRestorePartialSuccess(): void
    {
        $okFileId     = 200;
        $failedFileId = 201;
        $parentId     = 300;

        $okEntity     = $this->makeRecycleBinEntity($okFileId);
        $failedEntity = $this->makeRecycleBinEntity($failedFileId);
        $okFile       = $this->makeDeletedFileEntity($okFileId, $parentId, 'ok.txt', projectId: 1);
        $failedFile   = $this->makeDeletedFileEntity($failedFileId, 999, 'fail.txt', projectId: 1);
        $parent       = $this->makeFileEntity($parentId, null, 'docs', projectId: 1, isDirectory: true);

        $this->recycleBinRepo->method('findLatestByResourceIds')
            ->willReturn([$okEntity, $failedEntity]);
        $this->recycleBinRepo->method('deleteById')->willReturn(true);

        $this->taskFileRepo->method('getByIdWithTrash')
            ->willReturnCallback(function (int $id) use ($okFileId, $failedFileId, $parentId, $okFile, $failedFile, $parent) {
                return match ($id) {
                    $okFileId     => $okFile,
                    $failedFileId => $failedFile,
                    $parentId     => $parent,
                    999           => null,
                    default       => null,
                };
            });

        $this->taskFileRepo->method('getByProjectParentAndName')->willReturn(null);
        $this->taskFileRepo->method('restoreFile');
        $this->taskFileRepo->method('getById')->willReturn(
            $this->makeFileEntity($okFileId, $parentId, 'ok.txt', projectId: 1)
        );
        $this->taskFileRepo->method('updateById')->willReturn(true);

        // okFile: no conflict, should succeed
        // failedFile: parent 999 missing, no resolution → fail
        $result = $this->service->restoreBatch(
            [$okFileId, $failedFileId],
            RecycleBinResourceType::File,
            'user1',
            []
        );

        $this->assertCount(1, $result['succeeded']);
        $this->assertCount(1, $result['failed']);
        $this->assertEquals($okFileId, (int) $result['succeeded'][0]->getResourceId());
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    private function makeRecycleBinEntity(int $resourceId): RecycleBinEntity
    {
        $entity = new RecycleBinEntity();
        $entity->setId($resourceId + 10000);
        $entity->setResourceId($resourceId);
        $entity->setResourceType(RecycleBinResourceType::File);
        $entity->setResourceName('test');
        $entity->setOwnerId('user1');
        $entity->setDeletedBy('user1');
        $entity->setDeletedAt(date('Y-m-d H:i:s'));
        return $entity;
    }

    private function makeFileEntity(
        int $fileId,
        ?int $parentId,
        string $fileName,
        int $projectId = 1,
        bool $isDirectory = false
    ): TaskFileEntity {
        $entity = new TaskFileEntity([
            'file_id'      => $fileId,
            'parent_id'    => $parentId,
            'file_name'    => $fileName,
            'project_id'   => $projectId,
            'is_directory' => $isDirectory,
            'deleted_at'   => null,
        ]);
        return $entity;
    }

    private function makeDeletedFileEntity(
        int $fileId,
        ?int $parentId,
        string $fileName,
        int $projectId = 1,
        bool $isDirectory = false
    ): TaskFileEntity {
        $entity = new TaskFileEntity([
            'file_id'      => $fileId,
            'parent_id'    => $parentId,
            'file_name'    => $fileName,
            'project_id'   => $projectId,
            'is_directory' => $isDirectory,
            'deleted_at'   => date('Y-m-d H:i:s'),
        ]);
        return $entity;
    }
}
```

- [ ] **Step 2: Run tests — expect failures (TDD)**

```bash
cd /path/to/magic-service
vendor/bin/phpunit vendor/dtyq/super-magic-module/tests/Unit/Domain/RecycleBin/Service/RecycleBinRestoreDomainServiceTest.php --testdox
```

Expected: multiple failures (methods not yet refactored).

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/Unit/Domain/RecycleBin/Service/RecycleBinRestoreDomainServiceTest.php
git commit -m "test(recycle-bin): add failing tests for restore conflict handling (TDD)"
```

---

## Task 6: Refactor `RecycleBinRestoreDomainService`

**Files:**
- Modify: `src/Domain/RecycleBin/Service/RecycleBinRestoreDomainService.php`

The complete rewrite of this file is below. Key changes:
- Delete `resolveRestoreFileName`, `generateUniqueFileNameInParent`, `resolveRestoreParentId`
- Add `previewFileConflicts`
- Rewrite `restoreFile` with `conflict_resolutions` parameter
- Thread `conflict_resolutions` through `restoreBatch` → `restoreSingle` → `restoreFile`

- [ ] **Step 1: Replace file content**

```php
<?php

declare(strict_types=1);

namespace Dtyq\SuperMagic\Domain\RecycleBin\Service;

use Dtyq\SuperMagic\Application\RecycleBin\DTO\RestoreConflictDTO;
use Dtyq\SuperMagic\Application\RecycleBin\DTO\RestorePreviewItemDTO;
use Dtyq\SuperMagic\Domain\RecycleBin\Entity\RecycleBinEntity;
use Dtyq\SuperMagic\Domain\RecycleBin\Enum\RecycleBinResourceType;
use Dtyq\SuperMagic\Domain\RecycleBin\Enum\RestoreConflictResolution;
use Dtyq\SuperMagic\Domain\RecycleBin\Enum\RestoreConflictType;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ProjectEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TopicEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectMemberRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\ProjectRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\TaskFileRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\TopicRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\WorkspaceRepositoryInterface;
use Hyperf\DbConnection\Db;
use Hyperf\Logger\LoggerFactory;
use Psr\Log\LoggerInterface;
use RuntimeException;
use Throwable;

use function Hyperf\Translation\trans;

/**
 * Recycle bin restore domain service.
 *
 * Handles workspace, project, topic, and file restore (with cascade).
 * File restore supports explicit conflict resolution via conflict_resolutions map.
 */
class RecycleBinRestoreDomainService
{
    protected LoggerInterface $logger;

    public function __construct(
        protected RecycleBinRepositoryInterface $recycleBinRepository,
        protected WorkspaceRepositoryInterface $workspaceRepository,
        protected ProjectRepositoryInterface $projectRepository,
        protected TopicRepositoryInterface $topicRepository,
        protected TaskFileRepositoryInterface $taskFileRepository,
        protected ProjectMemberRepositoryInterface $projectMemberRepository,
        LoggerFactory $loggerFactory
    ) {
        $this->logger = $loggerFactory->get(self::class);
    }

    /**
     * Batch restore resources (partial success allowed).
     *
     * @param array $resourceIds
     * @param RecycleBinResourceType $resourceType
     * @param string $userId
     * @param array<string, array<string, string>> $conflictResolutions resource_id → [conflict_type → resolution]
     * @return array{succeeded: RecycleBinEntity[], failed: array{entity: RecycleBinEntity, error: string}[]}
     */
    public function restoreBatch(
        array $resourceIds,
        RecycleBinResourceType $resourceType,
        string $userId,
        array $conflictResolutions = []
    ): array {
        $entities = $this->recycleBinRepository->findLatestByResourceIds($resourceIds, $resourceType, $userId);

        if (empty($entities)) {
            return ['succeeded' => [], 'failed' => []];
        }

        $succeeded = [];
        $failed    = [];

        foreach ($entities as $entity) {
            try {
                $this->restoreSingle($entity, $userId, $conflictResolutions);
                $succeeded[] = $entity;
            } catch (Throwable $e) {
                $this->logger->error('Failed to restore resource', [
                    'recycle_bin_id' => $entity->getId(),
                    'resource_type'  => $entity->getResourceType()->value,
                    'resource_id'    => $entity->getResourceId(),
                    'error'          => $e->getMessage(),
                ]);

                $failed[] = [
                    'entity' => $entity,
                    'error'  => $e->getMessage(),
                ];
            }
        }

        return ['succeeded' => $succeeded, 'failed' => $failed];
    }

    /**
     * Preview file conflicts for a list of resource IDs.
     * Read-only; no side effects.
     *
     * @param array $resourceIds
     * @param string $userId
     * @return array{items_with_conflict: RestorePreviewItemDTO[], items_no_conflict: RestorePreviewItemDTO[]}
     */
    public function previewFileConflicts(array $resourceIds, string $userId): array
    {
        $itemsWithConflict = [];
        $itemsNoConflict   = [];

        if (empty($resourceIds)) {
            return ['items_with_conflict' => [], 'items_no_conflict' => []];
        }

        $entities = $this->recycleBinRepository->findLatestByResourceIds(
            $resourceIds,
            RecycleBinResourceType::File,
            $userId
        );

        foreach ($entities as $entity) {
            $fileId = (int) $entity->getResourceId();
            $file   = $this->taskFileRepository->getByIdWithTrash($fileId);

            // File permanently deleted or purged from recycle bin — no actionable conflict
            if ($file === null || $entity->getRemovedAt() !== null || $entity->getPurgedAt() !== null) {
                $itemsNoConflict[] = new RestorePreviewItemDTO(
                    resourceId:   (string) $fileId,
                    resourceName: $entity->getResourceName(),
                    isDirectory:  false,
                );
                continue;
            }

            $parentId = $file->getParentId();

            // Step 1: detect parent_missing
            if ($parentId !== null && $parentId > 0) {
                $parent = $this->taskFileRepository->getByIdWithTrash($parentId);
                if ($parent === null || $parent->getDeletedAt() !== null || ! $parent->getIsDirectory()) {
                    $itemsWithConflict[] = new RestorePreviewItemDTO(
                        resourceId:   (string) $fileId,
                        resourceName: $file->getFileName(),
                        isDirectory:  $file->getIsDirectory(),
                        conflict:     new RestoreConflictDTO(
                            type:           RestoreConflictType::ParentMissing,
                            originalParentId: $parentId,
                        ),
                    );
                    continue;
                }
            }

            // Step 2: detect name_conflict (only when parent is healthy)
            $existing = $this->taskFileRepository->getByProjectParentAndName(
                $file->getProjectId(),
                $parentId,
                $file->getFileName()
            );

            if ($existing !== null && $existing->getFileId() !== $file->getFileId()) {
                $itemsWithConflict[] = new RestorePreviewItemDTO(
                    resourceId:   (string) $fileId,
                    resourceName: $file->getFileName(),
                    isDirectory:  $file->getIsDirectory(),
                    conflict:     new RestoreConflictDTO(
                        type:               RestoreConflictType::NameConflict,
                        existingFileId:     $existing->getFileId(),
                        existingIsDirectory: $existing->getIsDirectory(),
                    ),
                );
                continue;
            }

            $itemsNoConflict[] = new RestorePreviewItemDTO(
                resourceId:   (string) $fileId,
                resourceName: $file->getFileName(),
                isDirectory:  $file->getIsDirectory(),
            );
        }

        return [
            'items_with_conflict' => $itemsWithConflict,
            'items_no_conflict'   => $itemsNoConflict,
        ];
    }

    /**
     * Restore project and its sub-resources without parent check (no recycle bin record deletion).
     */
    public function restoreProjectWithoutParentCheck(int $projectId, string $userId): void
    {
        $restored = $this->projectRepository->restore($projectId, $userId);
        if (! $restored) {
            throw new RuntimeException(trans('recycle_bin.restore.project_failed'));
        }

        $restoredMembers = $this->projectMemberRepository->restoreByProjectIds([$projectId], $userId);
        $this->logger->info('Restored project members', [
            'project_id'   => $projectId,
            'member_count' => $restoredMembers,
        ]);

        $excludeTopicIds = $this->recycleBinRepository->findResourceIdsByParent(
            $projectId,
            RecycleBinResourceType::Topic
        );

        $restoredTopics = $this->topicRepository->restoreByProjectId($projectId, $excludeTopicIds, $userId);
        $this->logger->info('Restored topics under project', [
            'project_id'     => $projectId,
            'restored_count' => $restoredTopics,
            'excluded_count' => count($excludeTopicIds),
        ]);
    }

    /**
     * Restore topic without parent check (no recycle bin record deletion).
     */
    public function restoreTopicWithoutParentCheck(int $topicId, string $userId): void
    {
        $restored = $this->topicRepository->restore($topicId, $userId);
        if (! $restored) {
            throw new RuntimeException(trans('recycle_bin.restore.topic_failed'));
        }

        $this->logger->info('Topic restored', ['topic_id' => $topicId, 'user_id' => $userId]);
    }

    /**
     * Find project by ID including soft-deleted records.
     */
    public function findProjectByIdWithTrashed(int $projectId): ?ProjectEntity
    {
        return $this->projectRepository->findByIdWithTrashed($projectId);
    }

    /**
     * Find topic by ID including soft-deleted records.
     */
    public function findTopicByIdWithTrashed(int $topicId): ?TopicEntity
    {
        return $this->topicRepository->findByIdWithTrashed($topicId);
    }

    /**
     * @param array<string, array<string, string>> $conflictResolutions
     */
    private function restoreSingle(
        RecycleBinEntity $entity,
        string $userId,
        array $conflictResolutions = []
    ): void {
        $resourceType = $entity->getResourceType();

        match ($resourceType) {
            RecycleBinResourceType::Workspace => $this->restoreWorkspace($entity, $userId),
            RecycleBinResourceType::Project   => $this->restoreProject($entity, $userId),
            RecycleBinResourceType::Topic     => $this->restoreTopic($entity, $userId),
            RecycleBinResourceType::File      => $this->restoreFile($entity, $userId, $conflictResolutions),
            default => throw new RuntimeException(
                trans('recycle_bin.restore.unsupported_resource_type', ['type' => $resourceType->value])
            ),
        };
    }

    private function restoreWorkspace(RecycleBinEntity $entity, string $userId): void
    {
        $workspaceId = (int) $entity->getResourceId();

        Db::beginTransaction();
        try {
            $restored = $this->workspaceRepository->restore($workspaceId, $userId);
            if (! $restored) {
                throw new RuntimeException(trans('recycle_bin.restore.workspace_not_found_or_permanently_deleted'));
            }

            $excludeProjectIds = $this->recycleBinRepository->findResourceIdsByParent(
                $workspaceId,
                RecycleBinResourceType::Project
            );

            $restoredProjects = $this->projectRepository->restoreByWorkspaceId(
                $workspaceId,
                $excludeProjectIds,
                $userId
            );

            $this->logger->info('Restored projects under workspace', [
                'workspace_id'   => $workspaceId,
                'restored_count' => $restoredProjects,
                'excluded_count' => count($excludeProjectIds),
            ]);

            $restoredProjectIds = $this->projectRepository->findProjectIdsByWorkspaceId(
                $workspaceId,
                $excludeProjectIds
            );

            $excludeTopicIds = $this->recycleBinRepository->findResourceIdsByParents(
                $restoredProjectIds,
                RecycleBinResourceType::Topic
            );

            $restoredTopics = $this->topicRepository->restoreByWorkspaceId(
                $workspaceId,
                $restoredProjectIds,
                $excludeTopicIds,
                $userId
            );

            $this->logger->info('Restored topics under workspace', [
                'workspace_id'   => $workspaceId,
                'restored_count' => $restoredTopics,
                'excluded_count' => count($excludeTopicIds),
            ]);

            $this->recycleBinRepository->deleteById($entity->getId());

            Db::commit();
        } catch (Throwable $e) {
            Db::rollBack();
            $this->logger->error('Failed to restore workspace', [
                'workspace_id' => $workspaceId,
                'error'        => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    private function restoreProject(RecycleBinEntity $entity, string $userId): void
    {
        $projectId = (int) $entity->getResourceId();

        Db::transaction(function () use ($projectId, $entity, $userId) {
            $project = $this->projectRepository->findByIdWithTrashed($projectId);
            if (! $project) {
                throw new RuntimeException(trans('recycle_bin.restore.project_not_found_or_permanently_deleted'));
            }

            $workspaceId = $project->getWorkspaceId();
            if ($workspaceId !== null) {
                $workspaceExists = $this->workspaceRepository->existsAndNotDeleted($workspaceId);
                if (! $workspaceExists) {
                    throw new RuntimeException(trans('recycle_bin.restore.parent_workspace_missing'));
                }
            } else {
                $this->logger->warning('workspace_id is null when restoring project', [
                    'project_id'     => $projectId,
                    'recycle_bin_id' => $entity->getId(),
                ]);
            }

            $this->restoreProjectWithoutParentCheck($projectId, $userId);
            $this->recycleBinRepository->deleteById($entity->getId());
        });
    }

    private function restoreTopic(RecycleBinEntity $entity, string $userId): void
    {
        $topicId = (int) $entity->getResourceId();

        Db::transaction(function () use ($topicId, $entity, $userId) {
            $topic = $this->topicRepository->findByIdWithTrashed($topicId);
            if (! $topic) {
                throw new RuntimeException(trans('recycle_bin.restore.topic_not_found_or_permanently_deleted'));
            }

            $parentId = $entity->getParentId();
            if ($parentId !== null) {
                $parentExists = $this->projectRepository->existsAndNotDeleted($parentId);
                if (! $parentExists) {
                    throw new RuntimeException(trans('recycle_bin.restore.parent_project_missing'));
                }
            } else {
                $this->logger->warning('parent_id is null when restoring topic', [
                    'topic_id'       => $topicId,
                    'recycle_bin_id' => $entity->getId(),
                ]);
            }

            $this->restoreTopicWithoutParentCheck($topicId, $userId);
            $this->recycleBinRepository->deleteById($entity->getId());
        });
    }

    /**
     * Restore a file or directory.
     *
     * Checks parent_missing then name_conflict in order.
     * Any unresolved conflict (missing or 'skip' strategy) throws, causing the item to be failed.
     *
     * @param array<string, array<string, string>> $conflictResolutions
     */
    private function restoreFile(
        RecycleBinEntity $entity,
        string $userId,
        array $conflictResolutions = []
    ): void {
        $fileId     = (int) $entity->getResourceId();
        $resolution = $conflictResolutions[(string) $fileId] ?? [];

        Db::transaction(function () use ($fileId, $entity, $userId, $resolution) {
            // 1. Validate recycle bin record state
            if ($entity->getRemovedAt() !== null || $entity->getPurgedAt() !== null) {
                throw new RuntimeException(trans('recycle_bin.restore.file_removed_cannot_restore'));
            }

            // 2. Load file (including soft-deleted)
            $file = $this->taskFileRepository->getByIdWithTrash($fileId);
            if ($file === null) {
                throw new RuntimeException(trans('recycle_bin.restore.file_not_found_or_permanently_deleted'));
            }

            // 3. Already restored — just clean up recycle bin record
            if ($file->getDeletedAt() === null) {
                $this->recycleBinRepository->deleteById($entity->getId());
                return;
            }

            // 4. Resolve target parent (use file.parent_id directly, no extra_data)
            $targetParentId = $this->resolveTargetParentId($file->getParentId(), $file->getProjectId(), $resolution);

            // 5. Check name conflict at resolved target location
            $existing = $this->taskFileRepository->getByProjectParentAndName(
                $file->getProjectId(),
                $targetParentId,
                $file->getFileName()
            );

            if ($existing !== null && $existing->getFileId() !== $file->getFileId()) {
                $nameResolution = RestoreConflictResolution::tryFrom($resolution['name_conflict'] ?? '');

                if ($nameResolution === RestoreConflictResolution::Overwrite) {
                    // Soft-delete the conflicting entry (self only, no recursive)
                    $this->taskFileRepository->deleteById($existing->getFileId(), false);
                    $this->logger->info('Overwrote conflicting file during restore', [
                        'existing_file_id' => $existing->getFileId(),
                        'restore_file_id'  => $fileId,
                    ]);
                } else {
                    throw new RuntimeException(trans('recycle_bin.restore.file_name_conflict'));
                }
            }

            // 6. Restore the file record
            $this->taskFileRepository->restoreFile($fileId);
            $restored = $this->taskFileRepository->getById($fileId);
            if ($restored === null) {
                throw new RuntimeException(trans('recycle_bin.restore.file_failed'));
            }

            // 7. Update parent and timestamp
            $restored->setParentId($targetParentId);
            $restored->setFileName($file->getFileName());
            $restored->setFileExtension(
                $restored->getIsDirectory() ? '' : (pathinfo($file->getFileName(), PATHINFO_EXTENSION) ?: '')
            );
            $restored->setDeletedAt(null);
            $restored->setUpdatedAt(date('Y-m-d H:i:s'));
            $this->taskFileRepository->updateById($restored);

            // 8. Bump parent metadata version
            if ($targetParentId !== null && $targetParentId > 0) {
                $this->taskFileRepository->incrementMetadataVersionByIds([$targetParentId]);
            }

            $this->logger->info('File restored successfully', [
                'file_id'          => $fileId,
                'target_parent_id' => $targetParentId,
                'user_id'          => $userId,
            ]);

            // 9. Remove recycle bin record
            $this->recycleBinRepository->deleteById($entity->getId());
        });
    }

    /**
     * Resolve the effective target parent ID.
     * Uses file.parent_id directly. On parent_missing, applies resolution strategy.
     *
     * @param array<string, string> $resolution
     * @throws RuntimeException when parent is missing and no valid resolution is given
     */
    private function resolveTargetParentId(?int $parentId, int $projectId, array $resolution): ?int
    {
        // Root-level file — no parent check needed
        if ($parentId === null || $parentId <= 0) {
            return null;
        }

        $parent = $this->taskFileRepository->getByIdWithTrash($parentId);
        $parentMissing = $parent === null || $parent->getDeletedAt() !== null || ! $parent->getIsDirectory();

        if (! $parentMissing) {
            return $parentId;
        }

        // Parent is missing — apply resolution
        $parentResolution = RestoreConflictResolution::tryFrom($resolution['parent_missing'] ?? '');

        if ($parentResolution === RestoreConflictResolution::RestoreToRoot) {
            $root = $this->taskFileRepository->findRootDirectoryByProjectId($projectId);
            if ($root === null) {
                throw new RuntimeException(trans('recycle_bin.restore.file_restore_to_root_failed'));
            }
            return $root->getFileId();
        }

        throw new RuntimeException(trans('recycle_bin.restore.file_parent_missing'));
    }
}
```

- [ ] **Step 2: Run tests — expect all to pass**

```bash
cd /path/to/magic-service
vendor/bin/phpunit vendor/dtyq/super-magic-module/tests/Unit/Domain/RecycleBin/Service/RecycleBinRestoreDomainServiceTest.php --testdox
```

Expected: all tests PASS.

- [ ] **Step 3: Run full phpstan**

```bash
cd /path/to/magic-service
vendor/bin/phpstan analyse vendor/dtyq/super-magic-module/src/Domain/RecycleBin/
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/Domain/RecycleBin/Service/RecycleBinRestoreDomainService.php
git commit -m "refactor(recycle-bin): rewrite restoreFile with explicit conflict resolution, add previewFileConflicts"
```

---

## Task 7: Wire App Service

**Files:**
- Modify: `src/Application/RecycleBin/Service/RecycleBinAppService.php`

- [ ] **Step 1: Add `previewRestore` method and thread resolutions in `restore`**

Add the following `use` imports to the top of `RecycleBinAppService.php`:

```php
use Dtyq\SuperMagic\Application\RecycleBin\DTO\RestorePreviewRequestDTO;
use Dtyq\SuperMagic\Application\RecycleBin\DTO\RestorePreviewResponseDTO;
```

Add the `previewRestore` method:

```php
/**
 * Preview restore conflicts for a batch of resources.
 * Read-only; no side effects.
 */
public function previewRestore(
    RequestContext $requestContext,
    RestorePreviewRequestDTO $requestDTO
): RestorePreviewResponseDTO {
    $userAuthorization = $requestContext->getUserAuthorization();
    $userId = $userAuthorization->getId();

    $resourceType = $requestDTO->getResourceType();
    $resourceIds  = $requestDTO->getResourceIds();

    if ($resourceType === \Dtyq\SuperMagic\Domain\RecycleBin\Enum\RecycleBinResourceType::File) {
        $result = $this->recycleBinRestoreDomainService->previewFileConflicts($resourceIds, $userId);
    } else {
        // Non-File types: placeholder — return all as no-conflict
        $result = ['items_with_conflict' => [], 'items_no_conflict' => []];
    }

    $this->logger->info('Preview restore conflicts', [
        'user_id'              => $userId,
        'resource_type'        => $resourceType->value,
        'with_conflict_count'  => count($result['items_with_conflict']),
        'no_conflict_count'    => count($result['items_no_conflict']),
    ]);

    return new RestorePreviewResponseDTO(
        $result['items_with_conflict'],
        $result['items_no_conflict']
    );
}
```

Update the existing `restore` method to thread `conflict_resolutions`. Change:

```php
$result = $this->recycleBinRestoreDomainService->restoreBatch(
    $resourceIds,
    $resourceType,
    $userId
);
```

To:

```php
$result = $this->recycleBinRestoreDomainService->restoreBatch(
    $resourceIds,
    $resourceType,
    $userId,
    $requestDTO->getConflictResolutions()
);
```

- [ ] **Step 2: Run phpstan**

```bash
vendor/bin/phpstan analyse vendor/dtyq/super-magic-module/src/Application/RecycleBin/
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/Application/RecycleBin/Service/RecycleBinAppService.php
git commit -m "feat(recycle-bin): add previewRestore app service method, thread conflict_resolutions into restore"
```

---

## Task 8: Controller + Route

**Files:**
- Modify: `src/Interfaces/RecycleBin/RecycleBinApi.php`
- Modify: `config/routes-v1/recycle-bin.php`

- [ ] **Step 1: Add controller method to `RecycleBinApi`**

Add import at top of `RecycleBinApi.php`:

```php
use Dtyq\SuperMagic\Application\RecycleBin\DTO\RestorePreviewRequestDTO;
```

Add method after the existing `restore` method:

```php
/**
 * Preview conflicts before restoring resources.
 *
 * @throws BusinessException
 */
public function previewRestore(RequestContext $requestContext): array
{
    $requestContext->setUserAuthorization($this->getAuthorization());

    try {
        $requestDTO = RestorePreviewRequestDTO::fromRequest($this->request);
    } catch (InvalidArgumentException $e) {
        throw new BusinessException(
            $e->getMessage(),
            GenericErrorCode::ParameterValidationFailed->value
        );
    }

    return $this->recycleBinAppService->previewRestore($requestContext, $requestDTO)->toArray();
}
```

- [ ] **Step 2: Register route in `config/routes-v1/recycle-bin.php`**

Add after the existing `Router::post('/restore', ...)` line:

```php
// Preview restore conflicts
Router::post('/restore/preview', [RecycleBinApi::class, 'previewRestore']);
```

- [ ] **Step 3: Commit**

```bash
git add src/Interfaces/RecycleBin/RecycleBinApi.php \
        config/routes-v1/recycle-bin.php
git commit -m "feat(recycle-bin): add POST /api/v1/recycle-bin/restore/preview endpoint"
```

---

## Task 9: Final Validation

- [ ] **Step 1: Run all tests**

```bash
cd /path/to/magic-service
vendor/bin/phpunit vendor/dtyq/super-magic-module/tests/Unit/Domain/RecycleBin/Service/RecycleBinRestoreDomainServiceTest.php --testdox
```

Expected: all tests pass, 0 failures.

- [ ] **Step 2: Run phpstan on all changed directories**

```bash
vendor/bin/phpstan analyse \
  vendor/dtyq/super-magic-module/src/Domain/RecycleBin/ \
  vendor/dtyq/super-magic-module/src/Application/RecycleBin/ \
  vendor/dtyq/super-magic-module/src/Interfaces/RecycleBin/
```

Expected: 0 errors.

- [ ] **Step 3: Verify `resolveRestoreFileName` and `generateUniqueFileNameInParent` are gone**

```bash
grep -rn "resolveRestoreFileName\|generateUniqueFileNameInParent\|resolveRestoreParentId" \
  vendor/dtyq/super-magic-module/src/
```

Expected: no matches.

- [ ] **Step 4: Final commit message if any loose files**

```bash
git status
# If clean, nothing needed. Otherwise:
git add -A
git commit -m "chore(recycle-bin): finalize restore conflict refactor"
```

---

## Self-Review Checklist

| Spec requirement | Task covering it |
|---|---|
| preview endpoint returning `items_with_conflict` / `items_no_conflict` | Task 2 (DTOs), Task 6 (`previewFileConflicts`), Task 7+8 (API) |
| `conflict` is single object (not array) | Task 2 `RestorePreviewItemDTO` |
| `parent_missing` and `name_conflict` mutually exclusive in preview | Task 6 `previewFileConflicts` (step 5 `continue` after parent_missing) |
| `conflict_resolutions` map in restore request | Task 3 |
| `restore_to_root` strategy: query root via `findRootDirectoryByProjectId` | Task 6 `resolveTargetParentId` |
| `overwrite` strategy: soft-delete only (no recursive), `deleteById($id, false)` | Task 6 `restoreFile` step 5 |
| Old files not entering recycle bin on overwrite | Task 6 uses `deleteById(false)` not recycle bin API |
| Conflict blocks restore — missing strategy = failed | Task 6 `resolveTargetParentId` + name_conflict block both throw |
| Non-File type preview returns all no-conflict | Task 7 `previewRestore` else branch |
| Batch partial success | Task 6 `restoreBatch` unchanged try/catch pattern |
| `restore_to_root` + root also has name_conflict handled | Task 6 (name_conflict check runs after targetParentId resolved) |
| Delete 3 old methods | Task 6 (not present in new file) |
| Language messages added | Task 4 |
| Tests: preview mutual exclusion, blocking, critical scenario, batch partial | Task 5 |
