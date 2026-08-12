<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\AbstractSandboxOS;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Request\ChatMessageRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Request\CheckpointRollbackCheckRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Request\CheckpointRollbackCommitRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Request\CheckpointRollbackRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Request\CheckpointRollbackStartRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Request\CheckpointRollbackUndoRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Request\InterruptRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Request\SaveFilesRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Request\ScriptTaskRequest;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Agent\Response\AgentResponse;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Constants\SandboxEndpoints;
use App\Infrastructure\SuperMagic\ExternalAPI\SandboxOS\Gateway\SandboxGatewayInterface;
use Exception;
use Hyperf\Logger\LoggerFactory;

/**
 * 沙箱Agent服务实现
 * 通过Gateway转发机制与Agent通信
 */
class SandboxAgentService extends AbstractSandboxOS implements SandboxAgentInterface
{
    public function __construct(
        LoggerFactory $loggerFactory,
        private readonly SandboxGatewayInterface $gateway
    ) {
        parent::__construct($loggerFactory);
    }

    /**
     * 初始化Agent.
     */
    public function initAgent(DataIsolation $dataIsolation, string $sandboxId, array $config): AgentResponse
    {
        $this->logger->info('[Sandbox][Agent] Initializing agent', [
            'sandbox_id' => $sandboxId,
            'user_id' => $config['user_id'] ?? '',
            'task_mode' => $config['task_mode'] ?? '',
            'agent_mode' => $config['agent_mode'] ?? '',
            'model_id' => $config['model_id'] ?? null,
        ]);

        try {
            // 通过Gateway转发到Agent API
            $result = $this->gateway->proxySandboxRequest(
                $dataIsolation,
                $sandboxId,
                'POST',
                SandboxEndpoints::AGENT_MESSAGES_CHAT,
                $config
            );

            $response = AgentResponse::fromGatewayResult($result);

            if ($response->isSuccess()) {
                $this->logger->info('[Sandbox][Agent] Agent initialized successfully', [
                    'sandbox_id' => $sandboxId,
                    'agent_id' => $response->getAgentId(),
                ]);
            } else {
                $this->logger->error('[Sandbox][Agent] Failed to initialize agent', [
                    'sandbox_id' => $sandboxId,
                    'code' => $response->getCode(),
                    'message' => $response->getMessage(),
                ]);
            }

            return $response;
        } catch (Exception $e) {
            $this->logger->error('[Sandbox][Agent] Unexpected error when initializing agent', [
                'sandbox_id' => $sandboxId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return AgentResponse::fromApiResponse([
                'code' => 2000,
                'message' => 'Unexpected error: ' . $e->getMessage(),
                'data' => [],
            ]);
        }
    }

    /**
     * 发送聊天消息给Agent.
     */
    public function sendChatMessage(DataIsolation $dataIsolation, string $sandboxId, ChatMessageRequest $request): AgentResponse
    {
        $this->logger->debug('[Sandbox][Agent] Sending chat message to agent', [
            'sandbox_id' => $sandboxId,
            'user_id' => $request->getUserId(),
            'task_id' => $request->getTaskId(),
            'prompt_length' => strlen($request->getPrompt()),
            'model_id' => $request->getModelId(),
        ]);

        try {
            // 通过Gateway转发到Agent API
            $result = $this->gateway->proxySandboxRequest(
                $dataIsolation,
                $sandboxId,
                'POST',
                SandboxEndpoints::AGENT_MESSAGES_CHAT,
                $request->toArray()
            );

            $response = AgentResponse::fromGatewayResult($result);

            $this->logger->debug('[Sandbox][Agent] Chat message sent to agent', [
                'sandbox_id' => $sandboxId,
                'success' => $response->isSuccess(),
                'message_id' => $response->getMessageId(),
                'has_response' => $response->hasResponseMessage(),
            ]);

            return $response;
        } catch (Exception $e) {
            $this->logger->error('[Sandbox][Agent] Unexpected error when sending chat message', [
                'sandbox_id' => $sandboxId,
                'error' => $e->getMessage(),
            ]);

            return AgentResponse::fromApiResponse([
                'code' => 2000,
                'message' => 'Unexpected error: ' . $e->getMessage(),
                'data' => [],
            ]);
        }
    }

    /**
     * 发送中断消息给Agent.
     */
    public function sendInterruptMessage(DataIsolation $dataIsolation, string $sandboxId, InterruptRequest $request): AgentResponse
    {
        $this->logger->info('[Sandbox][Agent] Sending interrupt message to agent', [
            'sandbox_id' => $sandboxId,
            'user_id' => $request->getUserId(),
            'task_id' => $request->getTaskId(),
            'remark' => $request->getRemark(),
        ]);

        try {
            // 通过Gateway转发到Agent API
            $result = $this->gateway->proxySandboxRequest(
                $dataIsolation,
                $sandboxId,
                'POST',
                SandboxEndpoints::AGENT_MESSAGES_CHAT,
                $request->toArray()
            );

            $response = AgentResponse::fromGatewayResult($result);

            if ($response->isSuccess()) {
                $this->logger->info('[Sandbox][Agent] Interrupt message sent successfully', [
                    'sandbox_id' => $sandboxId,
                    'user_id' => $request->getUserId(),
                    'task_id' => $request->getTaskId(),
                ]);
            } else {
                $this->logger->error('[Sandbox][Agent] Failed to send interrupt message', [
                    'sandbox_id' => $sandboxId,
                    'code' => $response->getCode(),
                    'message' => $response->getMessage(),
                ]);
            }

            return $response;
        } catch (Exception $e) {
            $this->logger->error('[Sandbox][Agent] Unexpected error when sending interrupt message', [
                'sandbox_id' => $sandboxId,
                'error' => $e->getMessage(),
            ]);

            return AgentResponse::fromApiResponse([
                'code' => 2000,
                'message' => 'Unexpected error: ' . $e->getMessage(),
                'data' => [],
            ]);
        }
    }

    /**
     * 获取工作区状态.
     */
    public function getWorkspaceStatus(DataIsolation $dataIsolation, string $sandboxId): AgentResponse
    {
        $this->logger->debug('[Sandbox][Agent] Getting workspace status', [
            'sandbox_id' => $sandboxId,
        ]);

        try {
            // 通过Gateway转发到Agent API
            $result = $this->gateway->proxySandboxRequest(
                $dataIsolation,
                $sandboxId,
                'GET',
                SandboxEndpoints::WORKSPACE_STATUS
            );

            $response = AgentResponse::fromGatewayResult($result);

            $this->logger->debug('[Sandbox][Agent] Workspace status retrieved', [
                'sandbox_id' => $sandboxId,
                'success' => $response->isSuccess(),
                'status' => $response->getDataValue('status'),
            ]);

            return $response;
        } catch (Exception $e) {
            $this->logger->error('[Sandbox][Agent] Unexpected error when getting workspace status', [
                'sandbox_id' => $sandboxId,
                'error' => $e->getMessage(),
            ]);

            return AgentResponse::fromApiResponse([
                'code' => 2000,
                'message' => 'Unexpected error: ' . $e->getMessage(),
                'data' => [],
            ]);
        }
    }

    /**
     * 重置沙箱保活状态.
     */
    public function resetKeepAlive(DataIsolation $dataIsolation, string $sandboxId, string $source): AgentResponse
    {
        $this->logger->debug('[Sandbox][Agent] Resetting sandbox keepalive', [
            'sandbox_id' => $sandboxId,
            'source' => $source,
        ]);

        try {
            $result = $this->gateway->proxySandboxRequest(
                $dataIsolation,
                $sandboxId,
                'POST',
                SandboxEndpoints::SANDBOX_KEEPALIVE_RESET,
                ['source' => $source]
            );

            $response = AgentResponse::fromGatewayResult($result);

            if ($response->isSuccess()) {
                $this->logger->info('[Sandbox][Agent] Sandbox keepalive reset successfully', [
                    'sandbox_id' => $sandboxId,
                    'source' => $source,
                ]);
            } else {
                $this->logger->error('[Sandbox][Agent] Failed to reset sandbox keepalive', [
                    'sandbox_id' => $sandboxId,
                    'source' => $source,
                    'code' => $response->getCode(),
                    'message' => $response->getMessage(),
                ]);
            }

            return $response;
        } catch (Exception $e) {
            $this->logger->error('[Sandbox][Agent] Unexpected error when resetting sandbox keepalive', [
                'sandbox_id' => $sandboxId,
                'source' => $source,
                'error' => $e->getMessage(),
            ]);

            return AgentResponse::fromApiResponse([
                'code' => 2000,
                'message' => 'Unexpected error: ' . $e->getMessage(),
                'data' => ['keepalive_refreshed' => false],
            ]);
        }
    }

    /**
     * 保存文件到沙箱.
     */
    public function saveFiles(DataIsolation $dataIsolation, string $sandboxId, SaveFilesRequest $request): AgentResponse
    {
        $this->logger->info('[Sandbox][Agent] Saving files to sandbox', [
            'sandbox_id' => $sandboxId,
            'file_count' => $request->getFileCount(),
        ]);

        try {
            // 通过Gateway转发到沙箱的文件编辑API
            $result = $this->gateway->proxySandboxRequest(
                $dataIsolation,
                $sandboxId,
                'POST',
                'api/v1/files/save',
                $request->toArray()
            );

            $response = AgentResponse::fromGatewayResult($result);

            if ($response->isSuccess()) {
                $this->logger->info('[Sandbox][Agent] Files saved successfully', [
                    'sandbox_id' => $sandboxId,
                    'file_count' => $request->getFileCount(),
                ]);
            } else {
                $this->logger->error('[Sandbox][Agent] Failed to save files', [
                    'sandbox_id' => $sandboxId,
                    'code' => $response->getCode(),
                    'message' => $response->getMessage(),
                ]);
            }

            return $response;
        } catch (Exception $e) {
            $this->logger->error('[Sandbox][Agent] Unexpected error when saving files', [
                'sandbox_id' => $sandboxId,
                'error' => $e->getMessage(),
            ]);

            return AgentResponse::fromApiResponse([
                'code' => 2000,
                'message' => 'Unexpected error: ' . $e->getMessage(),
                'data' => [],
            ]);
        }
    }

    public function executeScriptTask(DataIsolation $dataIsolation, string $sandboxId, ScriptTaskRequest $request): AgentResponse
    {
        $this->logger->info('[Sandbox][Agent] Executing script task', [
            'sandbox_id' => $sandboxId,
            'task_id' => $request->getTaskId(),
        ]);

        try {
            // 通过Gateway转发到沙箱的文件编辑API
            $result = $this->gateway->proxySandboxRequest(
                $dataIsolation,
                $sandboxId,
                'POST',
                '/api/task/script-task',
                $request->toArray()
            );

            $response = AgentResponse::fromGatewayResult($result);

            if ($response->isSuccess()) {
                $this->logger->info('[Sandbox][Agent] Files saved successfully', [
                    'sandbox_id' => $sandboxId,
                    'script_name' => $request->getScriptName(),
                    'arguments' => $request->getArguments(),
                ]);
            } else {
                $this->logger->error('[Sandbox][Agent] Failed to save files', [
                    'sandbox_id' => $sandboxId,
                    'code' => $response->getCode(),
                    'message' => $response->getMessage(),
                ]);
            }

            return $response;
        } catch (Exception $e) {
            $this->logger->error('[Sandbox][Agent] Unexpected error when executing script task', [
                'sandbox_id' => $sandboxId,
                'error' => $e->getMessage(),
            ]);

            return AgentResponse::fromApiResponse([
                'code' => 2000,
                'message' => 'Unexpected error: ' . $e->getMessage(),
                'data' => [],
            ]);
        }
    }

    /**
     * 回滚到指定的checkpoint.
     */
    public function rollbackCheckpoint(DataIsolation $dataIsolation, string $sandboxId, CheckpointRollbackRequest $request): AgentResponse
    {
        $this->logger->info('[Sandbox][Agent] Rolling back to checkpoint', [
            'sandbox_id' => $sandboxId,
            'target_message_id' => $request->getTargetMessageId(),
        ]);

        try {
            // 通过Gateway转发到沙箱的checkpoint回滚API
            $result = $this->gateway->proxySandboxRequest(
                $dataIsolation,
                $sandboxId,
                'POST',
                'api/checkpoints/rollback',
                $request->toArray()
            );

            $response = AgentResponse::fromGatewayResult($result);

            if ($response->isSuccess()) {
                $this->logger->info('[Sandbox][Agent] Checkpoint rollback successful', [
                    'sandbox_id' => $sandboxId,
                    'target_message_id' => $request->getTargetMessageId(),
                    'message' => $response->getMessage(),
                ]);
            } else {
                $this->logger->error('[Sandbox][Agent] Failed to rollback checkpoint', [
                    'sandbox_id' => $sandboxId,
                    'target_message_id' => $request->getTargetMessageId(),
                    'code' => $response->getCode(),
                    'message' => $response->getMessage(),
                ]);
            }

            return $response;
        } catch (Exception $e) {
            $this->logger->error('[Sandbox][Agent] Unexpected error when rolling back checkpoint', [
                'sandbox_id' => $sandboxId,
                'target_message_id' => $request->getTargetMessageId(),
                'error' => $e->getMessage(),
            ]);

            return AgentResponse::fromApiResponse([
                'code' => 2000,
                'message' => 'Unexpected error: ' . $e->getMessage(),
                'data' => [],
            ]);
        }
    }

    /**
     * 开始回滚到指定的checkpoint（标记状态而非删除）.
     */
    public function rollbackCheckpointStart(DataIsolation $dataIsolation, string $sandboxId, CheckpointRollbackStartRequest $request): AgentResponse
    {
        $this->logger->info('[Sandbox][Agent] Starting checkpoint rollback', [
            'sandbox_id' => $sandboxId,
            'target_message_id' => $request->getTargetMessageId(),
        ]);

        try {
            // 通过Gateway转发到沙箱的checkpoint回滚开始API
            $result = $this->gateway->proxySandboxRequest(
                $dataIsolation,
                $sandboxId,
                'POST',
                'api/checkpoints/rollback/start',
                $request->toArray()
            );

            $response = AgentResponse::fromGatewayResult($result);

            if ($response->isSuccess()) {
                $this->logger->info('[Sandbox][Agent] Checkpoint rollback start successful', [
                    'sandbox_id' => $sandboxId,
                    'target_message_id' => $request->getTargetMessageId(),
                    'message' => $response->getMessage(),
                ]);
            } else {
                $this->logger->error('[Sandbox][Agent] Failed to start checkpoint rollback', [
                    'sandbox_id' => $sandboxId,
                    'target_message_id' => $request->getTargetMessageId(),
                    'code' => $response->getCode(),
                    'message' => $response->getMessage(),
                ]);
            }

            return $response;
        } catch (Exception $e) {
            $this->logger->error('[Sandbox][Agent] Unexpected error when starting checkpoint rollback', [
                'sandbox_id' => $sandboxId,
                'target_message_id' => $request->getTargetMessageId(),
                'error' => $e->getMessage(),
            ]);

            return AgentResponse::fromApiResponse([
                'code' => 2000,
                'message' => 'Unexpected error: ' . $e->getMessage(),
                'data' => [],
            ]);
        }
    }

    /**
     * 提交回滚到指定的checkpoint（物理删除撤回状态的消息）.
     */
    public function rollbackCheckpointCommit(DataIsolation $dataIsolation, string $sandboxId, CheckpointRollbackCommitRequest $request): AgentResponse
    {
        $this->logger->info('[Sandbox][Agent] Committing checkpoint rollback', [
            'sandbox_id' => $sandboxId,
        ]);

        try {
            // 通过Gateway转发到沙箱的checkpoint回滚提交API
            $result = $this->gateway->proxySandboxRequest(
                $dataIsolation,
                $sandboxId,
                'POST',
                'api/checkpoints/rollback/commit',
                $request->toArray()
            );

            $response = AgentResponse::fromGatewayResult($result);

            if ($response->isSuccess()) {
                $this->logger->info('[Sandbox][Agent] Checkpoint rollback commit successful', [
                    'sandbox_id' => $sandboxId,
                    'message' => $response->getMessage(),
                ]);
            } else {
                $this->logger->error('[Sandbox][Agent] Failed to commit checkpoint rollback', [
                    'sandbox_id' => $sandboxId,
                    'code' => $response->getCode(),
                    'message' => $response->getMessage(),
                ]);
            }

            return $response;
        } catch (Exception $e) {
            $this->logger->error('[Sandbox][Agent] Unexpected error when committing checkpoint rollback', [
                'sandbox_id' => $sandboxId,
                'error' => $e->getMessage(),
            ]);

            return AgentResponse::fromApiResponse([
                'code' => 2000,
                'message' => 'Unexpected error: ' . $e->getMessage(),
                'data' => [],
            ]);
        }
    }

    /**
     * 撤销回滚沙箱checkpoint（将撤回状态的消息恢复为正常状态）.
     */
    public function rollbackCheckpointUndo(DataIsolation $dataIsolation, string $sandboxId, CheckpointRollbackUndoRequest $request): AgentResponse
    {
        $this->logger->info('[Sandbox][Agent] Undoing checkpoint rollback', [
            'sandbox_id' => $sandboxId,
        ]);

        try {
            // 通过Gateway转发到沙箱的checkpoint回滚撤销API
            $result = $this->gateway->proxySandboxRequest(
                $dataIsolation,
                $sandboxId,
                'POST',
                'api/checkpoints/rollback/undo',
                $request->toArray()
            );

            $response = AgentResponse::fromGatewayResult($result);

            if ($response->isSuccess()) {
                $this->logger->info('[Sandbox][Agent] Checkpoint rollback undo successful', [
                    'sandbox_id' => $sandboxId,
                    'message' => $response->getMessage(),
                ]);
            } else {
                $this->logger->error('[Sandbox][Agent] Failed to undo checkpoint rollback', [
                    'sandbox_id' => $sandboxId,
                    'code' => $response->getCode(),
                    'message' => $response->getMessage(),
                ]);
            }

            return $response;
        } catch (Exception $e) {
            $this->logger->error('[Sandbox][Agent] Unexpected error when undoing checkpoint rollback', [
                'sandbox_id' => $sandboxId,
                'error' => $e->getMessage(),
            ]);

            return AgentResponse::fromApiResponse([
                'code' => 2000,
                'message' => 'Unexpected error: ' . $e->getMessage(),
                'data' => [],
            ]);
        }
    }

    /**
     * 检查回滚到指定checkpoint的可行性.
     */
    public function rollbackCheckpointCheck(DataIsolation $dataIsolation, string $sandboxId, CheckpointRollbackCheckRequest $request): AgentResponse
    {
        $this->logger->info('[Sandbox][Agent] Checking checkpoint rollback feasibility', [
            'sandbox_id' => $sandboxId,
            'target_message_id' => $request->getTargetMessageId(),
        ]);

        try {
            // 通过Gateway转发到沙箱的checkpoint回滚检查API
            $result = $this->gateway->proxySandboxRequest(
                $dataIsolation,
                $sandboxId,
                'POST',
                'api/checkpoints/rollback/check',
                $request->toArray()
            );

            $response = AgentResponse::fromGatewayResult($result);

            if ($response->isSuccess()) {
                $this->logger->info('[Sandbox][Agent] Checkpoint rollback check successful', [
                    'sandbox_id' => $sandboxId,
                    'target_message_id' => $request->getTargetMessageId(),
                    'can_rollback' => $response->getDataValue('can_rollback'),
                ]);
            } else {
                $this->logger->error('[Sandbox][Agent] Failed to check checkpoint rollback', [
                    'sandbox_id' => $sandboxId,
                    'target_message_id' => $request->getTargetMessageId(),
                    'code' => $response->getCode(),
                    'message' => $response->getMessage(),
                ]);
            }

            return $response;
        } catch (Exception $e) {
            $this->logger->error('[Sandbox][Agent] Unexpected error when checking checkpoint rollback', [
                'sandbox_id' => $sandboxId,
                'target_message_id' => $request->getTargetMessageId(),
                'error' => $e->getMessage(),
            ]);

            return AgentResponse::fromApiResponse([
                'code' => 2000,
                'message' => 'Unexpected error: ' . $e->getMessage(),
                'data' => [],
            ]);
        }
    }
}
