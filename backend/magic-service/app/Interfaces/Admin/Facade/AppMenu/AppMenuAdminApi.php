<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Admin\Facade\AppMenu;

use App\Application\AppMenu\Service\AppMenuAppService;
use App\Application\Kernel\Enum\MagicOperationEnum;
use App\Application\Kernel\Enum\MagicResourceEnum;
use App\Domain\AppMenu\Entity\AppMenuEntity;
use App\Domain\AppMenu\Entity\ValueObject\AppMenuSourceType;
use App\Domain\AppMenu\Entity\ValueObject\AppMenuStatus;
use App\Domain\AppMenu\Entity\ValueObject\DisplayScope;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\VisibilityConfig;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\AbstractApi;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Util\OfficialOrganizationUtil;
use App\Infrastructure\Util\Permission\Annotation\CheckPermission;
use App\Interfaces\Admin\Assembler\AppMenu\AppMenuAssembler;
use App\Interfaces\Admin\DTO\AppMenu\AppMenuDTO;
use App\Interfaces\Admin\Request\AppMenu\AppMenuSaveRequest;
use App\Interfaces\Admin\Request\AppMenu\AppMenuStatusRequest;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\Di\Annotation\Inject;

#[ApiResponse('low_code')]
class AppMenuAdminApi extends AbstractApi
{
    #[Inject]
    protected AppMenuAppService $appMenuAppService;

    #[CheckPermission(MagicResourceEnum::PLATFORM_SETTING_APPLICATION, MagicOperationEnum::QUERY)]
    public function queries()
    {
        return $this->handleQueries();
    }

    #[CheckPermission(MagicResourceEnum::PLATFORM_SETTING_APPLICATION, MagicOperationEnum::QUERY)]
    public function show(string $id)
    {
        return $this->handleShow($id);
    }

    #[CheckPermission(MagicResourceEnum::PLATFORM_SETTING_APPLICATION, MagicOperationEnum::EDIT)]
    public function save(AppMenuSaveRequest $request)
    {
        return $this->handleSave($request);
    }

    #[CheckPermission(MagicResourceEnum::PLATFORM_SETTING_APPLICATION, MagicOperationEnum::EDIT)]
    public function delete()
    {
        return $this->handleDelete();
    }

    #[CheckPermission(MagicResourceEnum::PLATFORM_SETTING_APPLICATION, MagicOperationEnum::EDIT)]
    public function status(AppMenuStatusRequest $request)
    {
        return $this->handleStatus($request);
    }

    protected function handleQueries()
    {
        $authorization = $this->getAuthorization();
        $page = $this->createPage();
        $displayScopeRaw = $this->request->input('display_scope');
        $displayScope = null;
        if ($displayScopeRaw !== null && $displayScopeRaw !== '') {
            $scope = DisplayScope::tryFrom((int) $displayScopeRaw);
            if ($scope !== null) {
                $displayScope = $scope->value;
            }
        }
        $sourceType = null;
        $sourceTypeRaw = $this->request->input('source_type');
        if ($sourceTypeRaw !== null && $sourceTypeRaw !== '') {
            $type = AppMenuSourceType::tryFrom((int) $sourceTypeRaw);
            if ($type !== null) {
                $sourceType = $type->value;
            }
        }
        $status = null;
        $statusRaw = $this->request->input('status');
        if ($statusRaw !== null && $statusRaw !== '') {
            $statusEnum = AppMenuStatus::tryFrom((int) $statusRaw);
            if ($statusEnum !== null) {
                $status = $statusEnum->value;
            }
        }

        $filters = [
            'name' => (string) $this->request->input('name', ''),
            'display_scope' => $displayScope,
            'source_type' => $sourceType,
            'status' => $status,
        ];

        $result = $this->appMenuAppService->queries($authorization, $filters, $page);

        return AppMenuAssembler::createPageListDTO(
            total: $result['total'],
            list: $result['list'],
            page: $page,
            isOfficialOrganization: $this->isOfficialOrganization($authorization),
        );
    }

    protected function handleShow(string $id)
    {
        $authorization = $this->getAuthorization();
        $entity = $this->appMenuAppService->show($authorization, self::parseId($id));

        return $this->createResponseDTO($authorization, $entity);
    }

    protected function handleSave(AppMenuSaveRequest $request)
    {
        $authorization = $this->getAuthorization();
        $payload = $request->validated();

        if (array_key_exists('id', $payload)) {
            $idRaw = $payload['id'];
            if ($idRaw !== null && $idRaw !== '') {
                $payload['id'] = (string) self::parseId(is_scalar($idRaw) ? (string) $idRaw : null);
            } else {
                unset($payload['id']);
            }
        }
        $payload = $this->normalizeOverrideOnlyPayload($authorization, $payload);

        $dto = new AppMenuDTO($payload);
        $entity = AppMenuAssembler::createEntity($dto);
        $visibilityConfig = $this->createVisibilityConfig($payload['visibility_config'] ?? null);
        $savedEntity = $this->appMenuAppService->save($authorization, $entity, $visibilityConfig);

        return $this->createResponseDTO($authorization, $savedEntity);
    }

    protected function handleDelete()
    {
        $authorization = $this->getAuthorization();
        $id = $this->request->input('id');

        return $this->appMenuAppService->delete(
            $authorization,
            self::parseId(is_int($id) || is_string($id) ? $id : null)
        );
    }

    protected function handleStatus(AppMenuStatusRequest $request)
    {
        $authorization = $this->getAuthorization();
        $payload = $request->validated();
        $id = self::parseId($payload['id'] ?? '');
        $status = (int) $payload['status'];

        $entity = $this->appMenuAppService->updateStatus($authorization, $id, $status);

        return $this->createResponseDTO($authorization, $entity);
    }

    private function createResponseDTO(MagicUserAuthorization $authorization, AppMenuEntity $entity): AppMenuDTO
    {
        $organizationCode = $authorization->getOrganizationCode();
        $users = $this->appMenuAppService->getUsers($organizationCode, [$entity->getCreatorId()]);

        return AppMenuAssembler::createDTO($entity, $users, $this->isOfficialOrganization($authorization));
    }

    private function createVisibilityConfig(mixed $visibilityConfig): ?VisibilityConfig
    {
        if (! is_array($visibilityConfig) || ! array_key_exists('visibility_type', $visibilityConfig)) {
            return null;
        }

        return new VisibilityConfig($visibilityConfig);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function normalizeOverrideOnlyPayload(MagicUserAuthorization $authorization, array $payload): array
    {
        if (! filter_var($payload['override_only'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            return $payload;
        }

        $currentEntity = $this->appMenuAppService->show($authorization, self::parseId($payload['id'] ?? null));
        if (! array_key_exists('sort_order', $payload)) {
            $payload['sort_order'] = $currentEntity->getEffectiveSortOrder();
        }
        if (! array_key_exists('status', $payload)) {
            $payload['status'] = $currentEntity->getEffectiveStatus();
        }

        return $payload;
    }

    private function isOfficialOrganization(MagicUserAuthorization $authorization): bool
    {
        return OfficialOrganizationUtil::isOfficialOrganization($authorization->getOrganizationCode());
    }

    private static function parseId(null|int|string $id): int
    {
        if ($id === null || $id === '') {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.empty', ['label' => '应用ID']);
        }

        $id = (string) $id;
        if (! ctype_digit($id)) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => '应用ID']);
        }

        return (int) $id;
    }
}
