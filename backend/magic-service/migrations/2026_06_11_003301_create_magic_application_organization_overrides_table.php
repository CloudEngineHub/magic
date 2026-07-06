<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Domain\AppMenu\Entity\ValueObject\AppMenuStatus;
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('magic_application_organization_overrides')) {
            return;
        }

        Schema::create('magic_application_organization_overrides', static function (Blueprint $table) {
            $table->bigIncrements('id')->comment('主键ID');
            $table->unsignedBigInteger('app_menu_id')->comment('官方应用菜单ID');
            $table->string('organization_code', 50)->comment('组织编码');
            $table->integer('sort_order')->default(0)->comment('组织内排序，数值越大越靠前');
            $table->tinyInteger('status')->default(AppMenuStatus::Enabled->value)->comment('组织内状态: 1-正常, 2-禁用');
            $table->string('creator_id', 64)->default('')->comment('创建人ID');
            $table->dateTime('created_at')->comment('创建时间');
            $table->dateTime('updated_at')->comment('更新时间');
            $table->softDeletes()->comment('删除时间');

            $table->unique(['organization_code', 'app_menu_id'], 'uk_org_app_menu');
            $table->index(['app_menu_id'], 'idx_app_menu_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('magic_application_organization_overrides');
    }
};
