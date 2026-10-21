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
        Schema::table('magic_contact_accounts', static function (Blueprint $table): void {
            $table->tinyInteger('status')
                ->default(0)
                ->comment('账号状态,0:禁用,1:正常')
                ->change();
        });
    }

    public function down(): void
    {
        Schema::table('magic_contact_accounts', static function (Blueprint $table): void {
            $table->tinyInteger('status')
                ->default(0)
                ->comment('账号状态,0:正常,1:禁用')
                ->change();
        });
    }
};
