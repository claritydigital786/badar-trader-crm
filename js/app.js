// ─────────────────────────────────────────────────────────────
//  Badar Trader CRM — Phase 1 app logic
//  Requires: Supabase CDN + js/config.js loaded before this file
// ─────────────────────────────────────────────────────────────

// ── State ────────────────────────────────────────────────────
let _user    = null;   // supabase auth user object
let _profile = null;   // public.profiles row
let _agents  = [];     // cached agent list (Admin only — for lead assignment dropdowns)

// ── DOM shortcuts ────────────────────────────────────────────
const el     = id  => document.getElementById(id);
const val    = id  => el(id)?.value?.trim() ?? '';
const show   = id  => { const e = el(id); if (e) e.style.display = ''; }
const hide   = id  => { const e = el(id); if (e) e.style.display = 'none'; }
const esc    = s   => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtDate= ts  => ts ? new Date(ts).toLocaleDateString() : '—';

// ─────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Guard: catch un-configured credentials before anything runs
  if (SUPABASE_URL === 'YOUR_PROJECT_URL' || SUPABASE_ANON_KEY === 'YOUR_ANON_KEY') {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#121212;color:#e0e0e0;">
        <div style="text-align:center;max-width:440px;padding:32px">
          <h2 style="color:#c9a84c;margin-bottom:12px">CRM Not Configured</h2>
          <p>Open <code style="color:#c9a84c">js/config.js</code> and replace <code>YOUR_PROJECT_URL</code>
          and <code>YOUR_ANON_KEY</code> with your Supabase project credentials.</p>
        </div>
      </div>`;
    return;
  }

  // Listen for auth state changes (handles refresh/session-restore automatically)
  db.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      _user = session.user;
      try {
        _profile = await loadProfile(_user.id);
        renderDashboard();
      } catch (err) {
        showToast('Could not load profile: ' + err.message, 'error');
        await db.auth.signOut();
      }
    } else {
      _user    = null;
      _profile = null;
      renderLogin();
    }
  });

  el('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
});

// ─────────────────────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────────────────────
async function loadProfile(userId) {
  const { data, error } = await db.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

async function handleLogin() {
  const email = val('login-email');
  const pw    = val('login-password');
  setLoginError('');

  if (!email || !pw) { setLoginError('Enter your email and password.'); return; }

  const { error } = await db.auth.signInWithPassword({ email, password: pw });
  if (error) setLoginError(error.message);
  // success → onAuthStateChange fires → renderDashboard()
}

async function handleLogout() {
  await db.auth.signOut();
  // onAuthStateChange fires → renderLogin()
}

function setLoginError(msg) {
  el('login-error').textContent = msg;
}

// ─────────────────────────────────────────────────────────────
//  SCREENS
// ─────────────────────────────────────────────────────────────
function renderLogin() {
  el('app').style.display = 'none';
  el('login-screen').style.display = 'flex';
}

function renderDashboard() {
  el('login-screen').style.display = 'none';
  el('app').style.display = 'block';

  el('header-user').textContent = _profile.name;
  el('header-role').textContent = _profile.role;

  buildTabNav();
  showTab(_profile.role === 'admin' ? 'overview' : 'leads');
}

// ─────────────────────────────────────────────────────────────
//  TAB NAVIGATION
// ─────────────────────────────────────────────────────────────
const TAB_CONFIG = {
  admin: [
    { id: 'overview',      label: 'Overview'        },
    { id: 'leads',         label: 'All Leads'        },
    { id: 'team',          label: 'Team'             },
    { id: 'create-agent',  label: 'Create Agent'     },
    { id: 'meta',          label: 'Meta Integration' },
  ],
  agent: [
    { id: 'leads',  label: 'My Leads' },
  ],
};

function buildTabNav() {
  const tabs = TAB_CONFIG[_profile.role] ?? TAB_CONFIG.agent;
  el('tab-nav').innerHTML = tabs.map(t =>
    `<button class="tab-btn" data-tab="${t.id}" onclick="showTab('${t.id}')">${t.label}</button>`
  ).join('');
}

function showTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

  const pane = el('tab-' + tabId);
  if (!pane) return;
  pane.classList.add('active');

  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');

  loadTab(tabId);
}

async function loadTab(tabId) {
  const loaders = {
    overview:       renderOverview,
    leads:          renderLeads,
    team:           renderTeam,
    'create-agent': renderCreateAgent,
    meta:           renderMeta,
  };
  if (loaders[tabId]) await loaders[tabId]();
}

// ─────────────────────────────────────────────────────────────
//  OVERVIEW (admin only)
// ─────────────────────────────────────────────────────────────
async function renderOverview() {
  const pane = el('tab-overview');
  pane.innerHTML = '<div class="loading">Loading overview...</div>';

  const [{ data: leads }, { data: agents }] = await Promise.all([
    db.from('leads').select('status, assigned_agent_id'),
    db.from('profiles').select('id, name').eq('role', 'agent').order('name'),
  ]);

  const counts = { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 };
  (leads ?? []).forEach(l => { if (counts[l.status] !== undefined) counts[l.status]++; });
  const total    = leads?.length ?? 0;
  const convRate = total ? ((counts.converted / total) * 100).toFixed(1) : '0.0';

  const agentRows = (agents ?? []).map(a => {
    const al        = (leads ?? []).filter(l => l.assigned_agent_id === a.id);
    const converted = al.filter(l => l.status === 'converted').length;
    const active    = al.filter(l => !['converted','lost'].includes(l.status)).length;
    const rate      = al.length ? ((converted / al.length) * 100).toFixed(1) : '0.0';
    return `<tr>
      <td>${esc(a.name)}</td>
      <td>${al.length}</td>
      <td>${active}</td>
      <td>${converted}</td>
      <td>${rate}%</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">No agents yet.</td></tr>';

  pane.innerHTML = `
    <h3>Overview</h3>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${total}</div><div class="stat-label">Total Leads</div>
      </div>
      <div class="stat-card stat-new">
        <div class="stat-value">${counts.new}</div><div class="stat-label">New</div>
      </div>
      <div class="stat-card stat-contacted">
        <div class="stat-value">${counts.contacted}</div><div class="stat-label">Contacted</div>
      </div>
      <div class="stat-card stat-qualified">
        <div class="stat-value">${counts.qualified}</div><div class="stat-label">Qualified</div>
      </div>
      <div class="stat-card stat-converted">
        <div class="stat-value">${counts.converted}</div><div class="stat-label">Converted</div>
      </div>
      <div class="stat-card stat-lost">
        <div class="stat-value">${counts.lost}</div><div class="stat-label">Lost</div>
      </div>
    </div>
    <p class="stat-highlight">Overall conversion rate: <strong>${convRate}%</strong></p>

    <h3 style="margin-top:28px">Agent Performance</h3>
    <div class="card table-wrap">
      <table>
        <thead><tr><th>Agent</th><th>Total</th><th>Active</th><th>Converted</th><th>Conv. Rate</th></tr></thead>
        <tbody>${agentRows}</tbody>
      </table>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────
//  LEADS
// ─────────────────────────────────────────────────────────────
async function renderLeads() {
  const pane    = el('tab-leads');
  const isAdmin = _profile.role === 'admin';
  pane.innerHTML = '<div class="loading">Loading leads...</div>';

  if (isAdmin && _agents.length === 0) await refreshAgentCache();

  const { data: leads, error } = await db
    .from('leads')
    .select(`id, name, email, phone, source, instrument_type, status, notes, created_at,
             agent:profiles!leads_assigned_agent_id_fkey(id, name)`)
    .order('created_at', { ascending: false });

  if (error) { pane.innerHTML = `<div class="error">${esc(error.message)}</div>`; return; }

  const agentOpts = _agents.map(a =>
    `<option value="${a.id}">${esc(a.name)}</option>`
  ).join('');

  const statusOptions = (current) =>
    ['new','contacted','qualified','converted','lost'].map(s =>
      `<option value="${s}" ${s === current ? 'selected' : ''}>${s[0].toUpperCase()+s.slice(1)}</option>`
    ).join('');

  const rows = (leads ?? []).map(lead => `
    <tr>
      <td><strong>${esc(lead.name)}</strong></td>
      <td>
        ${lead.email ? `<div>${esc(lead.email)}</div>` : ''}
        ${lead.phone ? `<div class="sub-text">${esc(lead.phone)}</div>` : ''}
      </td>
      <td><span class="badge badge-src">${esc(lead.source)}</span></td>
      <td>${lead.instrument_type ? esc(lead.instrument_type) : '<span class="muted">—</span>'}</td>
      <td>
        <select class="status-sel status-${lead.status}"
                onchange="updateLeadStatus('${lead.id}', this.value)">
          ${statusOptions(lead.status)}
        </select>
      </td>
      ${isAdmin ? `
        <td>
          <select class="agent-sel" onchange="reassignLead('${lead.id}', this.value)">
            <option value="">Unassigned</option>
            ${_agents.map(a =>
              `<option value="${a.id}" ${lead.agent?.id === a.id ? 'selected':''}>${esc(a.name)}</option>`
            ).join('')}
          </select>
        </td>
      ` : ''}
      <td class="sub-text">${fmtDate(lead.created_at)}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="openLeadDetail('${lead.id}')">Details</button>
        ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteLead('${lead.id}')">Delete</button>` : ''}
      </td>
    </tr>
  `).join('') || `<tr><td colspan="${isAdmin ? 8 : 7}" class="empty">No leads yet. Click "+ Add Lead" to create one.</td></tr>`;

  pane.innerHTML = `
    <div class="pane-header">
      <h3>${isAdmin ? 'All Leads' : 'My Leads'}</h3>
      <button class="btn btn-primary" onclick="openCreateLeadModal()">+ Add Lead</button>
    </div>
    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th><th>Contact</th><th>Source</th><th>Instrument</th><th>Status</th>
            ${isAdmin ? '<th>Assigned Agent</th>' : ''}
            <th>Created</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function updateLeadStatus(leadId, status) {
  const { error } = await db.from('leads').update({ status }).eq('id', leadId);
  if (error) showToast(error.message, 'error');
  else showToast('Status updated');
}

async function reassignLead(leadId, agentId) {
  const { error } = await db.from('leads')
    .update({ assigned_agent_id: agentId || null })
    .eq('id', leadId);
  if (error) showToast(error.message, 'error');
  else showToast('Lead reassigned');
}

async function deleteLead(leadId) {
  if (!confirm('Delete this lead? This cannot be undone.')) return;
  const { error } = await db.from('leads').delete().eq('id', leadId);
  if (error) { showToast(error.message, 'error'); return; }
  showToast('Lead deleted');
  renderLeads();
}

// ─────────────────────────────────────────────────────────────
//  LEAD DETAIL MODAL
// ─────────────────────────────────────────────────────────────
async function openLeadDetail(leadId) {
  openModal('<div class="loading">Loading...</div>');

  const { data: lead, error } = await db
    .from('leads')
    .select(`*, agent:profiles!leads_assigned_agent_id_fkey(id,name),
             creator:profiles!leads_created_by_fkey(id,name)`)
    .eq('id', leadId)
    .single();

  if (error) { el('modal-body').innerHTML = `<div class="error">${esc(error.message)}</div>`; return; }

  const isAdmin = _profile.role === 'admin';

  el('modal-body').innerHTML = `
    <h3 style="margin-bottom:16px">Lead: ${esc(lead.name)}</h3>
    <div class="detail-grid">
      <div class="detail-row"><span class="detail-label">Email</span><span>${esc(lead.email || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Phone</span><span>${esc(lead.phone || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Source</span><span>${esc(lead.source)}</span></div>
      <div class="detail-row"><span class="detail-label">Instrument</span><span>${esc(lead.instrument_type || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Created</span><span>${new Date(lead.created_at).toLocaleString()}</span></div>
      <div class="detail-row"><span class="detail-label">Created by</span><span>${esc(lead.creator?.name || '—')}</span></div>
    </div>

    <label>Status</label>
    <select id="det-status" class="status-sel status-${lead.status}"
            onchange="this.className='status-sel status-'+this.value">
      ${['new','contacted','qualified','converted','lost'].map(s =>
        `<option value="${s}" ${s === lead.status ? 'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`
      ).join('')}
    </select>

    ${isAdmin ? `
      <label>Assigned Agent</label>
      <select id="det-agent">
        <option value="">Unassigned</option>
        ${_agents.map(a =>
          `<option value="${a.id}" ${lead.assigned_agent_id === a.id ? 'selected':''}>${esc(a.name)}</option>`
        ).join('')}
      </select>
    ` : ''}

    <label>Notes</label>
    <textarea id="det-notes" rows="4">${esc(lead.notes || '')}</textarea>

    <div class="form-actions" style="margin-top:18px">
      <button class="btn btn-primary" onclick="saveLeadDetail('${lead.id}')">Save Changes</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `;
}

async function saveLeadDetail(leadId) {
  const isAdmin = _profile.role === 'admin';
  const updates = {
    status: el('det-status').value,
    notes:  el('det-notes').value,
    ...(isAdmin && { assigned_agent_id: el('det-agent').value || null }),
  };
  const { error } = await db.from('leads').update(updates).eq('id', leadId);
  if (error) { showToast(error.message, 'error'); return; }
  showToast('Lead saved');
  closeModal();
  renderLeads();
}

// ─────────────────────────────────────────────────────────────
//  CREATE LEAD MODAL
// ─────────────────────────────────────────────────────────────
function openCreateLeadModal() {
  const isAdmin   = _profile.role === 'admin';
  const agentOpts = _agents.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');

  openModal(`
    <h3 style="margin-bottom:16px">Add New Lead</h3>
    <label>Full Name *</label>
    <input type="text" id="nl-name" placeholder="e.g. Ahmad Sultan"/>

    <div class="form-row" style="margin-top:0">
      <div>
        <label>Email</label>
        <input type="email" id="nl-email" placeholder="ahmad@example.com"/>
      </div>
      <div>
        <label>Phone</label>
        <input type="tel" id="nl-phone" placeholder="+971 50 000 0000"/>
      </div>
    </div>

    <div class="form-row">
      <div>
        <label>Source</label>
        <select id="nl-source">
          <option value="manual">Manual</option>
          <option value="meta">Meta (Facebook / Instagram)</option>
          <option value="referral">Referral</option>
          <option value="website">Website</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label>Instrument Type</label>
        <input type="text" id="nl-instrument" placeholder="e.g. Forex, Crypto, Stocks"/>
      </div>
    </div>

    ${isAdmin ? `
      <label>Assign To Agent</label>
      <select id="nl-agent">
        <option value="">Unassigned</option>
        ${agentOpts}
      </select>
    ` : ''}

    <label>Notes</label>
    <textarea id="nl-notes" rows="3" placeholder="Initial notes about this lead..."></textarea>

    <div class="form-actions" style="margin-top:18px">
      <button class="btn btn-primary" onclick="submitCreateLead()">Create Lead</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
    <div id="nl-err" class="form-msg error"></div>
  `);
}

async function submitCreateLead() {
  const isAdmin = _profile.role === 'admin';
  const name    = val('nl-name');
  if (!name) { el('nl-err').textContent = 'Name is required.'; return; }

  const lead = {
    name,
    email:             val('nl-email')      || null,
    phone:             val('nl-phone')      || null,
    source:            val('nl-source')     || 'manual',
    instrument_type:   val('nl-instrument') || null,
    notes:             val('nl-notes')      || null,
    created_by:        _user.id,
    assigned_agent_id: isAdmin
                         ? (el('nl-agent')?.value || null)
                         : _user.id,
  };

  const { error } = await db.from('leads').insert(lead);
  if (error) { el('nl-err').textContent = error.message; return; }
  showToast('Lead created');
  closeModal();
  renderLeads();
}

// ─────────────────────────────────────────────────────────────
//  TEAM (admin only)
// ─────────────────────────────────────────────────────────────
async function renderTeam() {
  const pane = el('tab-team');
  pane.innerHTML = '<div class="loading">Loading team...</div>';

  const [{ data: agents, error }, { data: leads }] = await Promise.all([
    db.from('profiles').select('id, name, email, is_active, created_at').eq('role','agent').order('name'),
    db.from('leads').select('assigned_agent_id, status'),
  ]);

  if (error) { pane.innerHTML = `<div class="error">${esc(error.message)}</div>`; return; }

  const rows = (agents ?? []).map(a => {
    const al        = (leads ?? []).filter(l => l.assigned_agent_id === a.id);
    const converted = al.filter(l => l.status === 'converted').length;
    const active    = al.filter(l => !['converted','lost'].includes(l.status)).length;
    return `<tr>
      <td>${esc(a.name)}</td>
      <td>${esc(a.email)}</td>
      <td>${al.length}</td>
      <td>${active}</td>
      <td>${converted}</td>
      <td><span class="badge ${a.is_active ? 'badge-active' : 'badge-inactive'}">
            ${a.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary"
                onclick="toggleAgentStatus('${a.id}', ${a.is_active})">
          ${a.is_active ? 'Deactivate' : 'Activate'}
        </button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">No agents yet. Use "Create Agent" to add one.</td></tr>';

  pane.innerHTML = `
    <h3>Team Members</h3>
    <div class="card table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Email</th><th>Total Leads</th><th>Active</th>
              <th>Converted</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function toggleAgentStatus(agentId, isActive) {
  const { error } = await db.from('profiles').update({ is_active: !isActive }).eq('id', agentId);
  if (error) { showToast(error.message, 'error'); return; }
  showToast(`Agent ${isActive ? 'deactivated' : 'activated'}`);
  _agents = [];    // clear cache
  renderTeam();
}

// ─────────────────────────────────────────────────────────────
//  CREATE AGENT (admin only)
// ─────────────────────────────────────────────────────────────
function renderCreateAgent() {
  el('tab-create-agent').innerHTML = `
    <h3>Create Agent Account</h3>
    <div class="card" style="max-width:460px">
      <p class="muted" style="font-size:.84rem;margin-bottom:4px">
        Creates a Supabase login for the new agent. They can sign in immediately
        with the email and password you set here.
      </p>
      <label>Full Name *</label>
      <input type="text" id="ca-name" placeholder="Jane Doe"/>
      <label>Email *</label>
      <input type="email" id="ca-email" placeholder="jane@example.com"/>
      <label>Temporary Password * (min. 8 characters)</label>
      <input type="password" id="ca-pw" placeholder="••••••••"/>
      <div class="form-actions" style="margin-top:20px">
        <button class="btn btn-primary" onclick="submitCreateAgent()">Create Agent</button>
      </div>
      <div id="ca-msg" class="form-msg"></div>
    </div>
  `;
}

async function submitCreateAgent() {
  const name  = val('ca-name');
  const email = val('ca-email');
  const pw    = el('ca-pw').value;
  const msgEl = el('ca-msg');

  msgEl.className = 'form-msg';
  msgEl.textContent = '';

  if (!name || !email || !pw)  { msgEl.className = 'form-msg error'; msgEl.textContent = 'All fields are required.'; return; }
  if (pw.length < 8)           { msgEl.className = 'form-msg error'; msgEl.textContent = 'Password must be at least 8 characters.'; return; }

  msgEl.textContent = 'Creating account...';

  // Separate client instance so the admin's own session is not touched
  const tempClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await tempClient.auth.signUp({
    email,
    password: pw,
    options: { data: { name, role: 'agent' } },
  });
  await tempClient.auth.signOut();

  if (error) { msgEl.className = 'form-msg error'; msgEl.textContent = error.message; return; }

  msgEl.className = 'form-msg success';
  msgEl.textContent = `Agent "${name}" created. They can now log in with ${email}.`;
  el('ca-name').value = '';
  el('ca-email').value = '';
  el('ca-pw').value = '';
  _agents = [];  // bust cache
}

// ─────────────────────────────────────────────────────────────
//  META INTEGRATION (admin only)
// ─────────────────────────────────────────────────────────────
async function renderMeta() {
  const pane = el('tab-meta');
  pane.innerHTML = '<div class="loading">Loading...</div>';

  const { data: rows } = await db.from('settings')
    .select('key, value')
    .in('key', ['meta_api_token', 'meta_account_id']);

  const s = Object.fromEntries((rows ?? []).map(r => [r.key, r.value]));

  pane.innerHTML = `
    <h3>Meta Integration</h3>
    <div class="card" style="max-width:540px">
      <p class="muted" style="font-size:.85rem;margin-bottom:18px">
        Save your Meta credentials here. In Phase 3 a Supabase Edge Function will act as the
        webhook endpoint so leads from Facebook/Instagram ads flow directly into this CRM.
      </p>

      <label>Meta API Token</label>
      <input type="text" id="meta-token" value="${esc(s.meta_api_token ?? '')}" placeholder="EAAxxxxxxx..."/>

      <label>Business Account ID</label>
      <input type="text" id="meta-account" value="${esc(s.meta_account_id ?? '')}" placeholder="act_123456789"/>

      <div class="webhook-box">
        <div class="muted" style="font-size:.78rem;margin-bottom:4px">Webhook URL — Phase 3 (not yet active)</div>
        <code class="webhook-url">https://&lt;your-project&gt;.supabase.co/functions/v1/meta-lead-webhook</code>
      </div>

      <div class="form-actions" style="margin-top:20px">
        <button class="btn btn-primary" onclick="saveMeta()">Save Settings</button>
      </div>
      <div id="meta-msg" class="form-msg"></div>
    </div>
  `;
}

async function saveMeta() {
  const token   = val('meta-token');
  const account = val('meta-account');
  const msgEl   = el('meta-msg');

  if (!token || !account) {
    msgEl.className = 'form-msg error';
    msgEl.textContent = 'Both fields are required.';
    return;
  }

  const { error } = await db.from('settings').upsert([
    { key: 'meta_api_token',  value: token,   updated_by: _user.id, updated_at: new Date().toISOString() },
    { key: 'meta_account_id', value: account, updated_by: _user.id, updated_at: new Date().toISOString() },
  ], { onConflict: 'key' });

  if (error) { msgEl.className = 'form-msg error'; msgEl.textContent = error.message; return; }

  msgEl.className = 'form-msg success';
  msgEl.textContent = 'Settings saved.';
  setTimeout(() => msgEl.textContent = '', 3000);
}

// ─────────────────────────────────────────────────────────────
//  MODAL
// ─────────────────────────────────────────────────────────────
function openModal(html) {
  el('modal-body').innerHTML = html;
  el('modal-overlay').classList.add('open');
}

function closeModal() {
  el('modal-overlay').classList.remove('open');
  el('modal-body').innerHTML = '';
}

function handleOverlayClick(e) {
  if (e.target === el('modal-overlay')) closeModal();
}

// ─────────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────────
let _toastTimer = null;

function showToast(msg, type = 'success') {
  const t = el('toast');
  t.textContent  = msg;
  t.className    = `toast toast-${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
async function refreshAgentCache() {
  const { data } = await db.from('profiles')
    .select('id, name')
    .eq('role', 'agent')
    .eq('is_active', true)
    .order('name');
  _agents = data ?? [];
}
