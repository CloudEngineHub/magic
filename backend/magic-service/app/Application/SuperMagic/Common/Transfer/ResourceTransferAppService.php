<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Common\Transfer;

use App\Application\Kernel\AbstractKernelAppService;
use App\Application\SuperMagic\Agent\Collaboration\AgentResourceAdapter;
use App\Application\SuperMagic\Skill\Collaboration\SkillResourceAdapter;
use App\Domain\Contact\Entity\ValueObject\UserStatus;
use App\Domain\Contact\Service\MagicUserDomainService;
use App\Domain\OrganizationEnvironment\Service\OrganizationDomainService;
use App\Domain\Permission\Entity\OperationPermissionEntity;
use App\Domain\Permission\Entity\ValueObject\OperationPermission\Operation;
use App\Domain\Permission\Entity\ValueObject\OperationPermission\ResourceType;
use App\Domain\Permission\Entity\ValueObject\OperationPermission\TargetType;
use App\Domain\Permission\Entity\ValueObject\PermissionDataIsolation;
use App\Domain\Permission\Service\OperationPermissionDomainService;
use App\Domain\Provider\Service\ModelFilter\PackageFilterInterface;
use App\Domain\SuperMagic\Agent\Entity\UserAgentEntity;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\AgentSourceType;
use App\Domain\SuperMagic\Agent\Entity\ValueObject\SuperMagicAgentDataIsolation;
use App\Domain\SuperMagic\Agent\Service\UserAgentDomainService;
use App\Domain\SuperMagic\Common\Event\ResourceTransferredEvent;
use App\Domain\SuperMagic\Common\Repository\ResourceTransferRepository;
use App\Domain\SuperMagic\Project\Entity\TransferLogEntity;
use App\Domain\SuperMagic\Project\Entity\ValueObject\TransferOptions;
use App\Domain\SuperMagic\Project\Entity\ValueObject\TransferStatus;
use App\Domain\SuperMagic\Project\Entity\ValueObject\TransferType;
use App\Domain\SuperMagic\Project\Event\ProjectTransferredEvent;
use App\Domain\SuperMagic\Project\Service\ProjectMemberDomainService;
use App\Domain\SuperMagic\Project\Service\TransferDomainService;
use App\Domain\SuperMagic\Project\Service\TransferLogDomainService;
use App\ErrorCode\SuperAgentErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Interfaces\SuperMagic\Common\DTO\Request\TransferResourceRequestDTO;
use DateTimeImmutable;
use Hyperf\DbConnection\Db;
use Hyperf\Logger\LoggerFactory;
use Psr\EventDispatcher\EventDispatcherInterface;
use Qbhy\HyperfAuth\Authenticatable;
use Throwable;

use function Hyperf\Translation\trans;

/** One transaction owns both resource and editing-project permissions. */
class ResourceTransferAppService extends AbstractKernelAppService
{
    public function __construct(
        private readonly ResourceTransferRepository $repository,
        private readonly OrganizationDomainService $organizations,
        private readonly MagicUserDomainService $users,
        private readonly PackageFilterInterface $packages,
        private readonly OperationPermissionDomainService $permissions,
        private readonly AgentResourceAdapter $agents,
        private readonly SkillResourceAdapter $skills,
        private readonly TransferDomainService $projects,
        private readonly ProjectMemberDomainService $members,
        private readonly UserAgentDomainService $ownerships,
        private readonly ResourceTransferDependencyGuard $dependencies,
        private readonly TransferLogDomainService $logs,
        private readonly EventDispatcherInterface $events,
        private readonly LoggerFactory $loggerFactory,
    ) {
    }

    public function transfer(Authenticatable $authorization, string $code, bool $isAgent, TransferResourceRequestDTO $request): array
    {
        $org = $authorization->getOrganizationCode();
        $sender = $authorization->getId();
        $organization = $this->organizations->getByCode($org);
        if (! $organization || $organization->isPersonal() || ! $this->packages->canTransferProject($org)) {
            ExceptionBuilder::throw(SuperAgentErrorCode::NO_PERMISSION_TO_TRANSFER, 'transfer.no_permission_to_transfer');
        }
        $receiver = $this->users->getByUserId($request->receiverId);
        if ($sender === $request->receiverId || ! $receiver || $receiver->getOrganizationCode() !== $org
            || $receiver->getStatus() !== UserStatus::Activated) {
            ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_ACCESS_DENIED, 'project.project_access_denied');
        }
        $isolation = PermissionDataIsolation::create($org, $sender);
        $type = $isAgent ? ResourceType::CustomAgent : ResourceType::Skill;
        $adapter = $isAgent ? $this->agents : $this->skills;
        $role = $request->shareToMe ? $request->shareRole : '';

        $projectId = 0;
        $projectName = '';
        $response = Db::transaction(function () use ($authorization, $code, $isAgent, $request, $org, $sender, $receiver, $isolation, $type, $adapter, $role, &$projectId, &$projectName) {
            $resource = $this->repository->lock($isAgent, $org, $code);
            // Recheck after acquiring the resource lock; a stale editor cannot transfer twice.
            if (! $resource || $resource->getAttribute($isAgent ? 'creator' : 'creator_id') !== $sender
                || in_array($resource->getAttribute('source_type'), ['MARKET', 'SYSTEM', 'OFFICIAL'], true)
                || ! $this->permissions->isResourceOwner($isolation, $type, $code, $sender)) {
                ExceptionBuilder::throw(SuperAgentErrorCode::NO_PERMISSION_TO_TRANSFER, 'transfer.no_permission_to_transfer');
            }
            $context = $adapter->getResource($authorization, $code);
            $projectId = $adapter->getProjectId($context);
            if ($isAgent) {
                $this->dependencies->assertAgentDependencies($authorization, $receiver, $code);
            }
            if ($projectId > 0) {
                $project = $this->repository->lockProject($projectId);
                if (! $project || $project->getAttribute('user_id') !== $sender || $project->getAttribute('user_organization_code') !== $org) {
                    ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_ACCESS_DENIED, 'project.project_access_denied');
                }
                $projectName = (string) $project->getAttribute('project_name');
                $result = $this->projects->transferProject(
                    $projectId,
                    $sender,
                    $request->receiverId,
                    $org,
                    TransferOptions::forProject($sender, trans('workspace.transferred_from'), $request->shareToMe, $role)
                );
                if (! $result->isSuccess()) {
                    ExceptionBuilder::throw(SuperAgentErrorCode::PROJECT_ACCESS_DENIED, $result->getErrorMessage() ?? 'project.project_access_denied');
                }
                $this->members->batchHandleReceiverMembership(
                    [$projectId],
                    $request->receiverId,
                    $sender,
                    $org,
                    $this->members->batchGetMembersByProjectsAndUser([$projectId], $request->receiverId)
                );
                $this->members->batchHandleOriginalOwnerMembership([$projectId], $sender, $org, $request->shareToMe, $role);
                $this->members->syncOwnerProjectWorkspaceBindings($request->receiverId, [$projectId], $result->getProject()->getWorkspaceId(), $org);
            }
            $this->permissions->transferOwner($isolation, $type, $code, $request->receiverId, $request->shareToMe);
            if ($request->shareToMe) {
                $permission = new OperationPermissionEntity();
                $permission->setOrganizationCode($org);
                $permission->setResourceType($type);
                $permission->setResourceId($code);
                $permission->setTargetType(TargetType::UserId);
                $permission->setTargetId($sender);
                $permission->setOperation(Operation::fromAlias($role));
                $permission->setCreator($sender);
                $permission->setModifier($sender);
                $this->permissions->batchUpsertResourceOperations($isolation, $type, $code, [$permission]);
            }
            $this->repository->changeOwner($resource, $isAgent, $request->receiverId);
            if ($isAgent) {
                $this->transferOwnershipRecord($org, $sender, $request, $code);
            }
            // Reconcile organization-market derived access after the old owner loses access.
            $adapter->afterCollaboratorRemoved($isolation, $code);
            $log = new TransferLogEntity();
            $log->setBatchId($this->projects->generateBatchId())
                ->setOrganizationCode($org)->setTransferType($isAgent ? TransferType::AGENT : TransferType::SKILL)
                ->setResourceId((int) $resource->getAttribute('id'))
                ->setResourceName($code)->setFromUserId($sender)->setToUserId($request->receiverId)
                ->setShareToOriginal($request->shareToMe)->setShareRole($role)->setStatus(TransferStatus::SUCCESS)
                ->setExtra(['code' => $code, 'project_id' => $projectId]);
            // Persist audit atomically: a logging failure rolls back the entire transfer.
            $this->logs->saveLog($log);
            return ['code' => $code, 'owner_id' => $request->receiverId, 'user_role' => $role ?: null];
        });
        try {
            $this->events->dispatch(new ResourceTransferredEvent($code, $isAgent ? 'agent' : 'skill', $org, $sender, $request->receiverId));
            if ($projectId > 0) {
                $this->events->dispatch(new ProjectTransferredEvent(
                    $projectId,
                    $projectName,
                    $sender,
                    $request->receiverId,
                    $org,
                    $request->shareToMe,
                    $role,
                    new DateTimeImmutable()
                ));
            }
        } catch (Throwable $error) {
            // Ownership is already committed; never encourage resubmitting an irreversible write.
            $this->loggerFactory->get('resource-transfer')->error('Transfer event dispatch failed', ['exception' => $error]);
        }
        return $response;
    }

    private function transferOwnershipRecord(string $org, string $sender, TransferResourceRequestDTO $request, string $code): void
    {
        $receiverIsolation = SuperMagicAgentDataIsolation::create($org, $request->receiverId);
        $ownership = $this->ownerships->findUserAgentOwnershipByCode($receiverIsolation, $code) ?? new UserAgentEntity();
        $ownership->setOrganizationCode($org)->setUserId($request->receiverId)->setAgentCode($code)
            ->setSourceType(AgentSourceType::LOCAL_CREATE)->setSourceId(null)->setAgentVersionId(null);
        $this->ownerships->saveUserAgentOwnership($receiverIsolation, $ownership);
        if (! $request->shareToMe) {
            $this->ownerships->deleteUserAgentOwnership(SuperMagicAgentDataIsolation::create($org, $sender), $code);
        }
    }
}
