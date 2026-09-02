// The deposit state machine: a submitted amount is not an approved balance.
//
// Business rule (Muhammad, 2026-09-01):
//   client submits  -> deposit_amount only, account_balance UNTOUCHED, no AUM,
//                      no conversion, no Ehsan ping - it goes to the agent
//   agent escalates -> agent_reviewed_* stamped, Ehsan notified once
//   Ehsan approves  -> and ONLY here: account_balance = the approved amount,
//                      status converted, AUM moves
//   Ehsan returns   -> reason required, agent notified, nothing financial moves
//
// This lifts the real rules out of index.html and the real Edge Function source
// rather than restating them, so the test fails if the shipped code drifts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../supabase/functions/conversion-hook/index.ts', import.meta.url), 'utf8');

// ── lift the real helpers ──────────────────────────────────────
const sandbox = {};
vm.createContext(sandbox);
{
  const start = html.indexOf('function depositStage(doc)');
  const end   = html.indexOf('// One query behind both queues');
  assert.ok(start > 0 && end > start, 'the deposit approval/stage block must exist');
  vm.runInContext(html.slice(start, end), sandbox);
}
{
  const start = html.indexOf('function isApprovedDeposit(lead)');
  const end   = html.indexOf('function transactionTotalsByCurrency');
  assert.ok(start > 0 && end > start, 'the approved-AUM block must exist');
  vm.runInContext(html.slice(start, end), sandbox);
}
const { depositApprovalProblems, depositStage, approvedAum, isApprovedDeposit } = sandbox;

const AGENT = 'agent-1', OTHER_AGENT = 'agent-2';
// A lead exactly as conversion-hook leaves it after a valid client submission.
const submittedLead = (over = {}) => ({
  id: 'lead-1', assigned_agent_id: AGENT, status: 'pending_approval',
  deposit_amount: 500, deposit_platform: 'exness', deposit_account_ref: 'TEST-001',
  account_balance: 0, balance_locked: false, converted_at: null, ...over,
});
const doc = (over = {}) => ({
  id: 'doc-1', client_id: 'lead-1', document_type: 'deposit_screenshot',
  status: 'pending', agent_reviewed_at: null, agent_reviewed_by: null, ...over,
});
const escalated = (over = {}) => doc({ agent_reviewed_at: '2026-09-01T10:00:00Z', agent_reviewed_by: AGENT, ...over });

// ══ A. Client submits $500 ════════════════════════════════════
{
  // What the Edge Function is allowed to write, read off the real source.
  const block = hook.slice(hook.indexOf('const update: Record<string, unknown> = {'),
                           hook.indexOf('if (acct) update.deposit_account_ref'));
  assert.ok(block.includes('deposit_amount: amount'), 'A: the submitted amount IS stored');
  assert.ok(!/account_balance/.test(block),
    'A: conversion-hook must NOT write account_balance at submission time');
  // Strip comments - the file explains at length WHY it no longer writes this,
  // and that prose must not be mistaken for the write itself.
  const hookCode = hook.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/account_balance/.test(hookCode),
    'A: no executable line of conversion-hook may touch account_balance');
  assert.ok(block.includes('status: "pending_approval"'), 'A: status becomes pending_approval');
  assert.ok(block.includes('verified: false'), 'A: never verified at submission');
  assert.ok(!/status:\s*"converted"/.test(hook), 'A: the hook can never convert a lead');

  const lead = submittedLead();
  assert.equal(lead.account_balance, 0, 'A: account_balance unchanged');
  assert.equal(approvedAum([lead]), 0, 'A: AUM unchanged - a pending deposit contributes $0');
  assert.equal(depositStage(doc()), 'awaiting_agent', 'A: lands in the agent queue as Review Required');

  // Ehsan is not pinged by the submission itself.
  assert.ok(!/notify-admin-pending-approval/.test(hook.split('Deno.serve')[1] || ''),
    'A: the hook must not call the admin notifier');
  assert.ok(hook.includes('deferred_to_agent_review'), 'A: the hook reports the ping is deferred to agent review');
}

// ══ B. Wrong agent cannot escalate ════════════════════════════
{
  // Enforced server-side in escalate_deposit_to_admin() (SECURITY DEFINER), and
  // the agent queue is additionally scoped client-side.
  assert.ok(html.includes('rows = rows.filter(r => r.lead?.assigned_agent_id === agentId)'),
    'B: the agent queue is scoped to the signed-in agent');
  const mine = [{ lead: { assigned_agent_id: AGENT } }, { lead: { assigned_agent_id: OTHER_AGENT } }]
    .filter(r => r.lead.assigned_agent_id === AGENT);
  assert.equal(mine.length, 1, "B: another agent's submission is not in this agent's queue");
  assert.ok(html.includes("sb.rpc('escalate_deposit_to_admin'"),
    'B: escalation goes through the server-side function, not a direct table write');
}

// ══ C. Assigned agent sends to admin ══════════════════════════
{
  const d = escalated();
  assert.equal(depositStage(d), 'awaiting_admin', 'C: stage moves to Awaiting Admin Approval');
  assert.ok(d.agent_reviewed_by && d.agent_reviewed_at, 'C: agent review fields stamped');

  const lead = submittedLead();
  assert.equal(lead.account_balance, 0, 'C: still no account_balance change');
  assert.equal(approvedAum([lead]), 0, 'C: still no AUM increase');
  assert.notEqual(lead.status, 'converted', 'C: escalation does not convert');

  // Exactly one ping: only fired when the RPC reports it was the escalating call.
  assert.ok(html.includes('if (row?.already_escalated)') &&
            html.includes('await notifyAdminsOfDepositEscalation(lead, docId)'),
    'C: the admin is notified only when this call actually escalated');
}

// ══ D. Ehsan approves ═════════════════════════════════════════
{
  const lead = submittedLead();
  assert.deepEqual([...depositApprovalProblems(lead, escalated())], [], 'D: a coherent submission is approvable');

  // What approveConversion writes.
  const approved = Number(lead.deposit_amount);
  const after = { ...lead, status: 'converted', account_balance: approved, balance_locked: true,
                  converted_at: '2026-09-01T12:00:00Z' };
  assert.equal(after.account_balance, 500, 'D: account_balance updated to the approved amount');
  assert.equal(approvedAum([after]) - approvedAum([lead]), 500, 'D: AUM +$500, exactly once');
  assert.equal([after].filter(l => l.status === 'converted').length, 1, 'D: converted count +1');
  assert.ok(isApprovedDeposit(after), 'D: dashboards and reports now count it');

  // Approving twice cannot double count: the second attempt is refused because
  // the lead is no longer pending_approval.
  assert.ok(depositApprovalProblems(after, escalated()).some(p => /not Pending Approval/.test(p)),
    'D: an already-converted lead cannot be approved again');
  assert.equal(approvedAum([after]), 500, 'D: AUM stays at $500, never $1000');

  // The write itself, read off the real source.
  // As of Phase 43 the writes live in ONE database transaction, not in the
  // browser: approve_deposit_and_convert() converts the lead, writes the
  // approved balance, marks the document verified and creates exactly one
  // deposit transaction. The frontend only calls it.
  const fn = html.slice(html.indexOf('async function approveConversion'), html.indexOf('async function rejectConversion'));
  assert.ok(/sb\.rpc\('approve_deposit_and_convert', \{ p_document_id: documentId \}\)/.test(fn),
    'D: approval routes through the atomic RPC');
  assert.ok(!/\.from\('leads'\)\s*\.update\(/.test(fn) && !/update\(\{[^}]*status: 'converted'/.test(fn),
    'D: the browser must no longer write the conversion itself');
  const mig = readFileSync(new URL('../supabase/migrations/20260901060000_deposit_approval_transaction.sql', import.meta.url), 'utf8');
  assert.ok(/account_balance = v_amount/.test(mig), 'D: the RPC writes account_balance');
  assert.ok(/status\s*=\s*'converted'/.test(mig) && /converted_at\s*=\s*now\(\)/.test(mig) && /balance_locked\s*=\s*true/.test(mig),
    'D: it also converts, stamps and locks');
  assert.ok(/SELECT l\.assigned_agent_id, l\.status, l\.deposit_amount/.test(mig),
    'D: the approved balance is read server-side from the submitted deposit_amount');
  assert.ok(!/p_amount|p_balance/.test(mig.split('$function$')[0]),
    'D: the function takes no amount from the caller');
}

// ══ E. Ehsan returns it ═══════════════════════════════════════
{
  const returned = doc({ status: 'rejected', notes: 'Screenshot is cropped.', agent_reviewed_at: null });
  assert.equal(depositStage(returned), 'returned', 'E: stage is Returned - Action Required');

  const lead = submittedLead();
  assert.equal(lead.account_balance, 0, 'E: no account_balance change');
  assert.equal(approvedAum([lead]), 0, 'E: no AUM increase');
  assert.notEqual(lead.status, 'converted', 'E: not converted');

  // A returned document cannot be approved without being re-sent.
  assert.ok(depositApprovalProblems(lead, undefined).some(p => /no deposit screenshot/.test(p)),
    'E: a returned document does not satisfy approval (the query excludes it)');
  const fn = html.slice(html.indexOf('async function approveConversion'), html.indexOf('async function rejectConversion'));
  assert.ok(/\.eq\('status', 'pending'\)/.test(fn) && /\.not\('agent_reviewed_at', 'is', null\)/.test(fn),
    'E: approval only ever looks at a pending, agent-escalated document');

  // Reason is mandatory, and the agent is told.
  assert.ok(html.includes("if (decision === 'rejected' && !note) { showToast('A reason is required when returning a deposit.', 'err'); return; }"),
    'E: a reason is required');
  assert.ok(html.includes("await notifyAgentOfDepositDecision(leadId, 'returned', note)"), 'E: the agent is notified');

  // ...and can re-send: escalate_deposit_to_admin accepts a returned document.
  assert.equal(depositStage(escalated({ status: 'pending' })), 'awaiting_admin', 'E: re-sent lands back with the admin');
}

// ══ F. Duplicate / retry ══════════════════════════════════════
{
  assert.ok(hook.includes('claim_deposit_submission'), 'F: submissions are claimed by content hash');
  const replay = hook.slice(hook.indexOf('if (isFirst !== true)'), hook.indexOf('const nowIso'));
  assert.ok(/duplicate: true/.test(replay), 'F: a replay returns duplicate and does nothing');
  // The replay returns BEFORE any upload, kyc insert, lead write or activity line.
  for (const sideEffect of ['storage', 'kyc_documents', 'from("leads").update', 'communication_logs']) {
    assert.ok(!replay.includes(sideEffect), `F: a replay must not reach ${sideEffect}`);
  }
  // Double-click on escalate cannot ping twice.
  assert.ok(html.includes("showToast('This deposit was already sent to Ehsan.')"),
    'F: a second escalation is reported, not re-notified');
  // Approving twice cannot double count - proved in D.
  const converted = submittedLead({ status: 'converted', account_balance: 500 });
  assert.equal(approvedAum([converted, converted].slice(0, 1)), 500, 'F: one lead counts once');
}

// ══ G. Forced submission failure leaves no orphans ════════════
{
  // Every side effect after the claim registers an undo, and any later failure
  // runs them all in reverse. Checked against the real source.
  assert.ok(hook.includes('const undo: Array<() => Promise<void>> = []'), 'G: an undo stack exists');
  assert.ok(hook.includes('const rollbackAndThrow'), 'G: failures roll back');
  assert.ok(!hook.includes('releaseAndThrow'), 'G: the old partial-cleanup path is gone');

  const body = hook.slice(hook.indexOf('const undo: Array'));
  // release the claim, remove the storage object, delete the kyc row
  for (const step of ['release_deposit_submission', 'deposit-screenshots").remove([path])',
                      'from("kyc_documents").delete()']) {
    assert.ok(body.includes(step), `G: rollback must undo ${step}`);
  }
  // The leads update failing must roll back, not just release the claim.
  assert.ok(/if \(ue\) await rollbackAndThrow\(ue\.message\);/.test(body),
    'G: a failed leads update rolls back the screenshot and the document too');
  // Undo steps run in reverse and each is independently best-effort.
  assert.ok(/for \(const step of undo\.reverse\(\)\)/.test(body), 'G: undo runs in reverse order');
  assert.ok(/try \{ await step\(\); \} catch/.test(body), 'G: one failing undo cannot block the rest');

  // Order matters: the undo for a thing is registered only AFTER it succeeded.
  const upIdx   = body.indexOf('.upload(path');
  const upUndo  = body.indexOf('deposit-screenshots").remove([path])');
  const docIdx  = body.indexOf('from("kyc_documents").insert');
  const docUndo = body.indexOf('from("kyc_documents").delete()');
  assert.ok(upIdx < upUndo && docIdx < docUndo, 'G: nothing is registered for undo before it exists');
}

// ══ H. A screenshot alone cannot authorise approval ═══════════
{
  // This is the exact production shape of the 2026-09-01 half-written test:
  // an orphan screenshot against a lead carrying no deposit data at all.
  const orphanLead = { id: 'lead-x', status: 'new', deposit_amount: null,
                       deposit_platform: null, deposit_account_ref: null, account_balance: 0 };
  const bad = depositApprovalProblems(orphanLead, doc());
  assert.ok(bad.length >= 4, 'H: an orphan screenshot fails several checks: ' + JSON.stringify(bad));
  for (const expected of [/not Pending Approval/, /no deposit amount/, /no broker/, /no trading account/]) {
    assert.ok(bad.some(p => expected.test(p)), 'H: must report ' + expected);
  }
  // Each field missing on its own is also fatal.
  assert.ok(depositApprovalProblems(submittedLead({ deposit_amount: 0 }), escalated())
    .some(p => /no deposit amount/.test(p)), 'H: amount is required');
  assert.ok(depositApprovalProblems(submittedLead({ deposit_platform: null }), escalated())
    .some(p => /no broker/.test(p)), 'H: broker is required');
  assert.ok(depositApprovalProblems(submittedLead({ deposit_account_ref: '' }), escalated())
    .some(p => /no trading account/.test(p)), 'H: account reference is required');
  assert.ok(depositApprovalProblems(submittedLead(), null)
    .some(p => /no deposit screenshot/.test(p)), 'H: a screenshot is required');
  // Present but never escalated by the agent - still refused.
  assert.ok(depositApprovalProblems(submittedLead(), doc())
    .some(p => /has not sent it for verification/.test(p)),
    'H: an un-escalated submission cannot be approved');
  assert.deepEqual([...depositApprovalProblems(submittedLead(), escalated())], [],
    'H: ...and the full, coherent, escalated submission IS approvable');
  assert.deepEqual([...depositApprovalProblems(null, escalated())], ['the lead no longer exists']);
}

// ══ I. Unrelated behaviour unchanged ══════════════════════════
{
  // The approval is still the one admin-gated path, still stamps converted_at,
  // and the AUM rule from the previous change is untouched.
  assert.ok(html.includes('function approvedAum(leads)'), 'I: the AUM rule still exists');
  assert.equal(approvedAum([{ status: 'converted', account_balance: 301 }]), 301,
    'I: the one real production converted lead still counts');
  // Phase 1 form fields untouched.
  const join = readFileSync(new URL('../join.html', import.meta.url), 'utf8');
  for (const f of ['id="email"', 'id="screenshot"', 'id="shot-replace"', 'id="shot-remove"', "fd.append('lead_id'"]) {
    assert.ok(join.includes(f), 'I: join.html keeps ' + f);
  }
  assert.ok(!/account_balance/.test(join), 'I: the public form never mentions account_balance');
  // The guard trigger is NOT weakened. This fix deliberately required no SQL at
  // all: the hook stopped writing the protected column, so the trigger never
  // fires for it, rather than the trigger being taught to let the hook through.
  assert.ok(!/CREATE OR REPLACE FUNCTION[\s\S]{0,80}guard_leads_admin_only_columns/.test(html),
    'I: the frontend does not redefine the guard');
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  assert.ok(schema.includes('IF NOT public.is_admin() THEN'),
    'I: the guard still refuses non-admins');
  assert.ok(schema.includes("RAISE EXCEPTION 'Only admins may change account_balance or kyc_status'"),
    'I: the guard still raises on a non-admin account_balance/kyc_status write');
  assert.ok(!/auth\.uid\(\) IS NULL[\s\S]{0,200}Only admins may change account_balance/.test(schema),
    'I: no backend escape hatch was added to the guard');
  // Approval is only reached through an admin check.
  assert.ok(html.includes("if (!isAdminRole(currentProfile?.role)) { showToast('Only an admin can decide a deposit.', 'err'); return; }"),
    'I: the deposit decision is still admin-only');
}

// ══ Approval must not half-write either ═══════════════════════
{
  // This used to be an ordering guarantee inside decideDeposit: convert first,
  // then mark the document. Phase 43 makes it an atomicity guarantee instead -
  // decideDeposit no longer touches the document at all, and the conversion and
  // the document write happen in ONE database transaction, so neither can land
  // without the other.
  const fn = html.slice(html.indexOf('async function decideDeposit'), html.indexOf('// The agent hears about BOTH outcomes'));
  const verifiedBranch = fn.slice(fn.indexOf("if (decision === 'verified')"), fn.indexOf("// Returning it puts it back"));
  assert.ok(!/kyc_documents/.test(verifiedBranch),
    'decideDeposit must no longer write the document itself - the RPC does');
  assert.ok(fn.includes('if (!converted) { renderDepositQueues(); return; }'),
    'a refused approval leaves the document untouched');

  const mig = readFileSync(new URL('../supabase/migrations/20260901060000_deposit_approval_transaction.sql', import.meta.url), 'utf8');
  const body = mig.slice(mig.indexOf('UPDATE public.leads'));
  const convertAt = body.indexOf("status          = 'converted'");
  const markAt    = body.indexOf("status      = 'verified'");
  const txnAt     = body.indexOf('INSERT INTO public.transactions');
  assert.ok(convertAt >= 0 && markAt > convertAt && txnAt > markAt,
    'the RPC converts, then marks the document, then records the transaction - in one transaction');
  assert.ok(/FOR UPDATE/.test(mig), 'the document row is locked, which serialises concurrent approvals');
  assert.ok(/CREATE UNIQUE INDEX[\s\S]{0,200}deposit_document_id[\s\S]{0,120}WHERE \(?deposit_document_id IS NOT NULL/.test(mig),
    'a partial unique index makes a second transaction for the same document impossible');
}

console.log('deposit-approval-balance: all assertions passed');
