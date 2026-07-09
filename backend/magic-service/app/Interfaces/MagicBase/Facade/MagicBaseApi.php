<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\Facade;

use App\Application\MagicBase\Assembler\MagicBaseAssembler;
use App\Application\MagicBase\Service\MagicBaseAdminAppService;
use App\Application\MagicBase\Service\MagicBasePermissionAppService;
use App\Application\MagicBase\Service\MagicBaseQueryAppService;
use App\Application\MagicBase\Service\MagicBaseRelationAppService;
use App\Application\MagicBase\Service\MagicBaseRowAppService;
use App\Application\MagicBase\Service\MagicBaseTableAppService;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;
use App\Infrastructure\Core\AbstractApi;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use App\Interfaces\MagicBase\Assembler\MagicBaseResponseAssembler;
use App\Interfaces\MagicBase\DTO\CreateColumnRequest;
use App\Interfaces\MagicBase\DTO\CreateRelationRequest;
use App\Interfaces\MagicBase\DTO\CreateRowRequest;
use App\Interfaces\MagicBase\DTO\CreateTableRequest;
use App\Interfaces\MagicBase\DTO\QueryRowsRequest;
use App\Interfaces\MagicBase\DTO\UpdateTableRequest;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Dtyq\SuperMagic\Application\SuperAgent\Service\AccessTokenAuthorizationService;
use Dtyq\SuperMagic\Domain\Share\Constant\ResourceType;
use Dtyq\SuperMagic\Domain\Share\Service\ResourceShareDomainService;
use Dtyq\SuperMagic\Infrastructure\Utils\AccessTokenUtil;
use Hyperf\Di\Annotation\Inject;
use Hyperf\HttpServer\Contract\RequestInterface;

#[ApiResponse('low_code')]
class MagicBaseApi extends AbstractApi
{
    #[Inject]
    protected MagicBaseTableAppService $tableAppService;

    #[Inject]
    protected MagicBaseRowAppService $rowAppService;

    #[Inject]
    protected MagicBaseQueryAppService $queryAppService;

    #[Inject]
    protected MagicBaseRelationAppService $relationAppService;

    #[Inject]
    protected MagicBasePermissionAppService $permissionAppService;

    #[Inject]
    protected MagicBaseAdminAppService $adminAppService;

    #[Inject]
    protected AccessTokenAuthorizationService $accessTokenAuthorizationService;

    #[Inject]
    protected ResourceShareDomainService $resourceShareDomainService;

    public function createTable(RequestInterface $request, string $projectId)
    {
        $requestDTO = new CreateTableRequest($request->all());
        $result = $this->tableAppService->createTable(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            MagicBaseAssembler::toCreateTableRequestDTO($requestDTO)
        );
        return MagicBaseResponseAssembler::tableDetail($result->table, $result->columns);
    }

    public function listTables(string $projectId): array
    {
        $projectId = self::parseId($projectId, '项目ID');
        $tables = $this->tableAppService->listTables($this->resolveRuntimeAuthorization($projectId), $projectId);
        return array_map(static fn (mixed $table) => MagicBaseResponseAssembler::tableSummary($table), iterator_to_array($tables));
    }

    public function getTable(string $projectId, string $tableId)
    {
        $projectId = self::parseId($projectId, '项目ID');
        $result = $this->tableAppService->getTable(
            $this->resolveRuntimeAuthorization($projectId),
            $projectId,
            self::parseId($tableId, '表ID'),
        );
        return MagicBaseResponseAssembler::tableDetail($result->table, $result->columns);
    }

    public function updateTable(RequestInterface $request, string $projectId, string $tableId)
    {
        $requestDTO = new UpdateTableRequest($request->all());
        $result = $this->tableAppService->updateTable(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            self::parseId($tableId, '表ID'),
            MagicBaseAssembler::toUpdateTableRequestDTO($requestDTO),
        );
        return MagicBaseResponseAssembler::tableDetail($result->table, $result->columns);
    }

    public function deleteTable(string $projectId, string $tableId)
    {
        $this->tableAppService->deleteTable(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            self::parseId($tableId, '表ID'),
        );
    }

    public function createColumn(RequestInterface $request, string $projectId, string $tableId)
    {
        $requestDTO = new CreateColumnRequest($request->all());
        $column = $this->tableAppService->createColumn(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            self::parseId($tableId, '表ID'),
            MagicBaseAssembler::toCreateColumnRequestDTO($requestDTO),
        );
        return MagicBaseResponseAssembler::column($column);
    }

    public function updateColumn(RequestInterface $request, string $projectId, string $tableId, string $columnId)
    {
        $requestDTO = new CreateColumnRequest($request->all());
        $column = $this->tableAppService->updateColumn(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            self::parseId($tableId, '表ID'),
            self::parseId($columnId, '字段ID'),
            MagicBaseAssembler::toCreateColumnRequestDTO($requestDTO),
        );
        return MagicBaseResponseAssembler::column($column);
    }

    public function deleteColumn(string $projectId, string $tableId, string $columnId)
    {
        $this->tableAppService->deleteColumn(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            self::parseId($tableId, '表ID'),
            self::parseId($columnId, '字段ID'),
        );
    }

    public function createRow(RequestInterface $request, string $projectId, string $tableId)
    {
        $projectId = self::parseId($projectId, '项目ID');
        $requestDTO = new CreateRowRequest($request->all());
        return MagicBaseResponseAssembler::row($this->rowAppService->createRow(
            $this->resolveRuntimeAuthorization($projectId),
            $projectId,
            self::parseId($tableId, '表ID'),
            MagicBaseAssembler::toCreateRowRequestDTO($requestDTO),
        ));
    }

    public function queryRows(RequestInterface $request, string $projectId, string $tableId)
    {
        $projectId = self::parseId($projectId, '项目ID');
        $requestDTO = new QueryRowsRequest($request->all());
        return MagicBaseResponseAssembler::page($this->queryAppService->queryRows(
            $this->resolveRuntimeAuthorization($projectId),
            $projectId,
            self::parseId($tableId, '表ID'),
            MagicBaseAssembler::toQueryRowsRequestDTO($requestDTO),
        ));
    }

    public function getRow(string $projectId, string $tableId, string $recordId)
    {
        $projectId = self::parseId($projectId, '项目ID');
        return MagicBaseResponseAssembler::row($this->queryAppService->showRow(
            $this->resolveRuntimeAuthorization($projectId),
            $projectId,
            self::parseId($tableId, '表ID'),
            self::parseId($recordId, '记录ID'),
            (string) $this->request->query('select', ''),
        ));
    }

    public function updateRow(RequestInterface $request, string $projectId, string $tableId, string $recordId)
    {
        $projectId = self::parseId($projectId, '项目ID');
        $requestDTO = new CreateRowRequest($request->all());
        return MagicBaseResponseAssembler::row($this->rowAppService->updateRow(
            $this->resolveRuntimeAuthorization($projectId),
            $projectId,
            self::parseId($tableId, '表ID'),
            self::parseId($recordId, '记录ID'),
            MagicBaseAssembler::toCreateRowRequestDTO($requestDTO),
        ));
    }

    public function deleteRow(string $projectId, string $tableId, string $recordId)
    {
        $projectId = self::parseId($projectId, '项目ID');
        $this->rowAppService->deleteRow(
            $this->resolveRuntimeAuthorization($projectId),
            $projectId,
            self::parseId($tableId, '表ID'),
            self::parseId($recordId, '记录ID'),
        );
    }

    public function createRelation(RequestInterface $request, string $projectId)
    {
        $requestDTO = new CreateRelationRequest($request->all());
        return MagicBaseResponseAssembler::relation($this->relationAppService->createRelation(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            MagicBaseAssembler::toRelationRequestDTO($requestDTO),
        ));
    }

    public function listRelations(string $projectId): array
    {
        $projectId = self::parseId($projectId, '项目ID');
        return array_map(
            static fn (mixed $relation) => MagicBaseResponseAssembler::relation($relation),
            iterator_to_array($this->relationAppService->listRelations(
                $this->resolveRuntimeAuthorization($projectId),
                $projectId,
            ))
        );
    }

    public function updateRelation(RequestInterface $request, string $projectId, string $relationId)
    {
        $requestDTO = new CreateRelationRequest($request->all());
        return MagicBaseResponseAssembler::relation($this->relationAppService->updateRelation(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            self::parseId($relationId, '关系ID'),
            MagicBaseAssembler::toRelationRequestDTO($requestDTO),
        ));
    }

    public function deleteRelation(string $projectId, string $relationId)
    {
        $this->relationAppService->deleteRelation(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            self::parseId($relationId, '关系ID'),
        );
    }

    public function createProjectAdmin(RequestInterface $request, string $projectId)
    {
        return MagicBaseResponseAssembler::admin($this->adminAppService->createProjectAdmin(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            MagicBaseAssembler::toSubjectRequestDTO($request->all()),
        ));
    }

    public function createTableAdmin(RequestInterface $request, string $projectId, string $tableId)
    {
        return MagicBaseResponseAssembler::admin($this->adminAppService->createTableAdmin(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            self::parseId($tableId, '表ID'),
            MagicBaseAssembler::toSubjectRequestDTO($request->all()),
        ));
    }

    public function createTablePermission(RequestInterface $request, string $projectId, string $tableId)
    {
        return MagicBaseResponseAssembler::tablePermission($this->permissionAppService->createTablePermission(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            self::parseId($tableId, '表ID'),
            MagicBaseAssembler::toTablePermissionRequestDTO($request->all()),
        ));
    }

    public function createColumnPermission(RequestInterface $request, string $projectId, string $tableId)
    {
        return MagicBaseResponseAssembler::columnPermission($this->permissionAppService->createColumnPermission(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            self::parseId($tableId, '表ID'),
            MagicBaseAssembler::toColumnPermissionRequestDTO($request->all()),
        ));
    }

    public function createRowPermission(RequestInterface $request, string $projectId, string $tableId)
    {
        return MagicBaseResponseAssembler::rowPermission($this->permissionAppService->createRowPermission(
            $this->getAuthorization(),
            self::parseId($projectId, '项目ID'),
            self::parseId($tableId, '表ID'),
            MagicBaseAssembler::toRowPermissionRequestDTO($request->all()),
        ));
    }

    private static function parseId(string $id, string $label): int
    {
        if (! ctype_digit($id)) {
            MagicBaseExceptionBuilder::validateFailed($label);
        }
        return (int) $id;
    }

    private function resolveRuntimeAuthorization(int $projectId): MagicUserAuthorization
    {
        $shareToken = trim((string) $this->request->header('x-magic-share-token', ''));
        if ($shareToken === '') {
            /** @var MagicUserAuthorization $authorization */
            $authorization = $this->getAuthorization();
            return $authorization;
        }

        if (! AccessTokenUtil::validate($shareToken)) {
            $this->denyRuntimeAccess();
        }

        $shareId = AccessTokenUtil::getShareId($shareToken);
        if ($shareId === null) {
            $this->denyRuntimeAccess();
        }

        $shareEntity = $this->resourceShareDomainService->getValidShareById($shareId);
        if ($shareEntity === null) {
            $this->denyRuntimeAccess();
        }

        if ($shareEntity->getResourceType() !== ResourceType::Project->value || (int) $shareEntity->getProjectId() !== $projectId) {
            $this->denyRuntimeAccess();
        }

        return $this->accessTokenAuthorizationService->validateTokenAndCreateUserAuthorization($shareToken);
    }

    /**
     * @return never
     */
    private function denyRuntimeAccess()
    {
        MagicBaseExceptionBuilder::accessDenied('无项目访问权限');
        throw new \RuntimeException('Unreachable.');
    }
}
