<?php
/** Shared backup and restore scope. */

declare(strict_types=1);

/** @return array<string, string> table => PostgREST conflict column */
function crmBackupTableMap(): array {
    return [
        'profiles' => 'id',
        'leads' => 'id',
        'lead_activity' => 'id',
        'audit_log' => 'id',
        'settings' => 'key',
        'transactions' => 'id',
        'kyc_documents' => 'id',
        'communications' => 'id',
        'automation_rules' => 'id',
        'signals' => 'id',
        'ai_knowledge_base' => 'id',
        'keyword_replies' => 'id',
        'follow_up_sequences' => 'id',
        'message_templates' => 'id',
        'subscribers' => 'id',
        'appointments' => 'id',
        'follow_up_sends' => 'id',
        'signal_broadcasts' => 'id',
        'ai_agents' => 'id',
        'payroll_settings' => 'agent_id',
        'payroll_runs' => 'id',
        'communication_logs' => 'id',
    ];
}

/** @return string[] */
function crmBackupSecretSettingKeys(): array {
    return [
        'meta_token',
        'openai_api_key',
        'wa_access_token',
        'wa_verify_token',
    ];
}
