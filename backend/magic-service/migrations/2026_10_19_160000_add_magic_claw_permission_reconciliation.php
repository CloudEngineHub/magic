<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('magic_super_magic_claw', function (Blueprint $table): void {
            $table->string('runtime_block_reason', 32)->default('');
            $table->unsignedBigInteger('runtime_block_revision')->default(0);
            $table->string('file_converter_sandbox_id', 128)->default('');
            $table->index(['organization_code', 'id'], 'idx_claw_org_cursor');
        });
        Schema::create('magic_claw_permission_reconciliations', function (Blueprint $table): void {
            $table->unsignedBigInteger('id')->primary();
            $table->string('organization_code', 64);
            $table->string('actor', 64)->default('');
            $table->string('reason', 32);
            $table->string('status', 24)->default('pending');
            $table->unsignedBigInteger('cursor')->default(0);
            $table->unsignedBigInteger('lease_until')->default(0);
            $table->string('lease_owner', 64)->default('');
            $table->boolean('scan_completed')->default(false);
            $table->datetimes();
            $table->index(['organization_code', 'id'], 'idx_claw_reconcile_org');
            $table->index(['status', 'id'], 'idx_claw_reconcile_pending');
        });
        Schema::create('magic_claw_permission_reconciliation_items', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('operation_id');
            $table->unsignedBigInteger('claw_id');
            $table->unsignedBigInteger('topic_id');
            $table->string('sandbox_id', 128)->default('');
            $table->string('status', 24)->default('pending');
            $table->unsignedInteger('attempts')->default(0);
            $table->unsignedBigInteger('next_retry_at')->default(0);
            $table->string('last_error', 128)->default('');
            $table->datetimes();
            $table->unique(['operation_id', 'claw_id', 'topic_id'], 'uniq_claw_reconcile_topic');
            $table->index(['operation_id', 'status', 'next_retry_at'], 'idx_claw_reconcile_due');
        });
    }

    public function down(): void
    {
        // Roll back application code before removing the pause and reconciliation state.
        Schema::dropIfExists('magic_claw_permission_reconciliation_items');
        Schema::dropIfExists('magic_claw_permission_reconciliations');
        Schema::table('magic_super_magic_claw', function (Blueprint $table): void {
            $table->dropIndex('idx_claw_org_cursor');
            $table->dropColumn(['runtime_block_reason', 'runtime_block_revision', 'file_converter_sandbox_id']);
        });
    }
};
