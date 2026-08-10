<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Agent\Service;

use App\Domain\Contact\Entity\MagicUserEntity;
use App\Domain\Contact\Service\MagicUserDomainService;
use App\Domain\SuperMagic\Agent\Entity\AgentCategoryEntity;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\Query\AgentCategoryQuery;
use App\Domain\SuperMagic\Agent\Service\SuperMagicAgentCategoryDomainService;
use App\ErrorCode\SuperMagicErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Interfaces\SuperMagic\Agent\DTO\Request\CreateAgentCategoryRequestAdminDTO;
use App\Interfaces\SuperMagic\Agent\DTO\Request\QueryAgentCategoriesRequestAdminDTO;
use App\Interfaces\SuperMagic\Agent\DTO\Request\UpdateAgentCategoryRequestAdminDTO;
use Hyperf\Di\Annotation\Inject;
use Qbhy\HyperfAuth\Authenticatable;
use Throwable;

class AdminSuperMagicCategoryAppService extends AbstractSuperMagicAppService
{
    #[Inject]
    protected SuperMagicAgentCategoryDomainService $categoryDomainService;

    #[Inject]
    protected MagicUserDomainService $magicUserDomainService;

    /** @return array<int, array<string, mixed>> */
    public function query(QueryAgentCategoriesRequestAdminDTO $requestDTO): array
    {
        $query = new AgentCategoryQuery();
        $query->setStatus($requestDTO->getStatus());
        $query->setKeyword($requestDTO->getKeyword());

        $categories = $this->categoryDomainService->findByQuery($query);
        $operatorUserMap = $this->buildOperatorUserMap($categories);
        $agentCountMap = $this->buildAgentCountMap($categories);

        return array_map(
            fn (AgentCategoryEntity $category): array => $this->buildCategoryResponse($category, $operatorUserMap, $agentCountMap),
            $categories
        );
    }

    public function get(int $id): AgentCategoryEntity
    {
        $category = $this->categoryDomainService->findById($id);
        if ($category === null) {
            ExceptionBuilder::throw(SuperMagicErrorCode::NotFound, 'common.not_found', ['label' => (string) $id]);
        }
        return $category;
    }

    /** @return array<string, mixed> */
    public function getDetail(int $id): array
    {
        $category = $this->get($id);
        return $this->buildCategoryResponse(
            $category,
            $this->buildOperatorUserMap([$category]),
            $this->buildAgentCountMap([$category])
        );
    }

    /** @return array<string, mixed> */
    public function create(Authenticatable $authorization, CreateAgentCategoryRequestAdminDTO $requestDTO): array
    {
        $dataIsolation = $this->createSuperMagicDataIsolation($authorization);
        $category = new AgentCategoryEntity();
        $category->setOrganizationCode($dataIsolation->getCurrentOrganizationCode())
            ->setNameI18n($requestDTO->nameI18n)
            ->setLogo($requestDTO->logo)
            ->setSortOrder($requestDTO->sortOrder)
            ->setStatus($requestDTO->status)
            ->setCreatorId($dataIsolation->getCurrentUserId())
            ->setModifierId($dataIsolation->getCurrentUserId());

        $category = $this->categoryDomainService->save($category);
        return $this->getDetail((int) $category->getId());
    }

    /** @return array<string, mixed> */
    public function update(Authenticatable $authorization, int $id, UpdateAgentCategoryRequestAdminDTO $requestDTO): array
    {
        $dataIsolation = $this->createSuperMagicDataIsolation($authorization);
        $category = $this->get($id);
        $payload = $requestDTO->getUpdatePayload();
        if (array_key_exists('name_i18n', $payload)) {
            $category->setNameI18n($payload['name_i18n']);
        }
        if (array_key_exists('logo', $payload)) {
            $category->setLogo($payload['logo']);
        }
        if (array_key_exists('sort_order', $payload)) {
            $category->setSortOrder($payload['sort_order']);
        }
        if (array_key_exists('status', $payload)) {
            $category->setStatus($payload['status']);
        }
        $category->setModifierId($dataIsolation->getCurrentUserId());
        $this->categoryDomainService->save($category);
        return $this->getDetail($id);
    }

    public function delete(int $id): void
    {
        $this->get($id);
        if ($this->categoryDomainService->isReferencedByMarket($id)) {
            ExceptionBuilder::throw(SuperMagicErrorCode::OperationFailed, 'super_magic.agent.category_used_by_market');
        }
        if (! $this->categoryDomainService->deleteById($id)) {
            ExceptionBuilder::throw(SuperMagicErrorCode::DeleteFailed, 'common.operation_failed');
        }
    }

    /**
     * @param array<string, MagicUserEntity> $creatorUserMap
     * @param array<int, int> $agentCountMap
     * @return array<string, mixed>
     */
    private function buildCategoryResponse(AgentCategoryEntity $category, array $creatorUserMap, array $agentCountMap): array
    {
        $modifierId = $category->getModifierId();
        $categoryId = $category->getId();
        $data = $category->toArray();
        $data['id'] = (string) $categoryId;
        $data['creator_id'] = $category->getCreatorId();
        $data['modifier_id'] = $modifierId;
        $data['creator'] = $this->buildUserInfo($category->getCreatorId(), $creatorUserMap);
        $data['modifier'] = $this->buildUserInfo($modifierId, $creatorUserMap);
        $data['agent_count'] = $categoryId === null ? 0 : ($agentCountMap[$categoryId] ?? 0);

        return $data;
    }

    /**
     * @param AgentCategoryEntity[] $categories
     * @return array<int, int>
     */
    private function buildAgentCountMap(array $categories): array
    {
        $categoryIds = [];
        foreach ($categories as $category) {
            if ($category->getId() !== null) {
                $categoryIds[] = $category->getId();
            }
        }

        return $this->categoryDomainService->getMarketReferenceCounts($categoryIds);
    }

    /**
     * @param AgentCategoryEntity[] $categories
     * @return array<string, MagicUserEntity>
     */
    private function buildOperatorUserMap(array $categories): array
    {
        $userIds = [];
        foreach ($categories as $category) {
            $userIds[] = $category->getCreatorId();
            if ($category->getModifierId() !== null) {
                $userIds[] = $category->getModifierId();
            }
        }
        $userIds = array_values(array_unique(array_filter($userIds)));

        if ($userIds === []) {
            return [];
        }

        try {
            $userEntities = $this->magicUserDomainService->getUserByIdsWithoutOrganization($userIds);
        } catch (Throwable) {
            return [];
        }

        $creatorUserMap = [];
        foreach ($userEntities as $userEntity) {
            $creatorUserMap[$userEntity->getUserId()] = $userEntity;
        }

        return $creatorUserMap;
    }

    /**
     * @param array<string, MagicUserEntity> $creatorUserMap
     * @return array{user_id: string, nickname: string}
     */
    private function buildUserInfo(?string $userId, array $creatorUserMap): array
    {
        if ($userId === null || $userId === '') {
            return [
                'user_id' => '',
                'nickname' => '',
            ];
        }

        $userEntity = $creatorUserMap[$userId] ?? null;
        if ($userEntity === null) {
            return [
                'user_id' => $userId,
                'nickname' => '',
            ];
        }

        return [
            'user_id' => $userEntity->getUserId(),
            'nickname' => $userEntity->getNickname(),
        ];
    }
}
