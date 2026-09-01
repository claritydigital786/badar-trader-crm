// Minimal in-memory Supabase + storage stub. Records every write so a test can
// assert that a failed submission left NOTHING behind.
export const store = {
  leads: [], kyc: [], logs: [], objects: new Map(), claims: new Map(),
  fail: { upload: false, kycInsert: false, leadsUpdate: false },
};
export function reset(leads = []) {
  store.leads = JSON.parse(JSON.stringify(leads));
  store.kyc = []; store.logs = []; store.objects = new Map(); store.claims = new Map();
  store.fail = { upload: false, kycInsert: false, leadsUpdate: false };
}
const tableOf = n => n === 'kyc_documents' ? store.kyc : n === 'communication_logs' ? store.logs : store.leads;
const uuid = () => 'id-' + Math.random().toString(16).slice(2, 10);

function query(name, op, payload) {
  const filters = [];
  let selected = false;
  const rows = () => tableOf(name).filter(r => filters.every(([k, v]) => r[k] === v));
  const api = {
    select() { selected = true; return api; },
    limit() { return api; },
    eq(k, v) { filters.push([k, v]); return api; },
    async maybeSingle() { return { data: rows()[0] ?? null, error: null }; },
    async single() {
      if (op === 'insert') {
        if (name === 'kyc_documents' && store.fail.kycInsert) return { data: null, error: { message: 'forced kyc failure' } };
        const row = { id: uuid(), ...payload }; tableOf(name).push(row); return { data: row, error: null };
      }
      const r = rows(); return { data: r[0] ?? null, error: r[0] ? null : { message: 'not found' } };
    },
    then(res, rej) { return api._run().then(res, rej); },
    async _run() {
      if (op === 'insert') {
        if (name === 'kyc_documents' && store.fail.kycInsert) return { data: null, error: { message: 'forced kyc failure' } };
        tableOf(name).push({ id: uuid(), ...payload }); return { data: null, error: null };
      }
      if (op === 'update') {
        if (name === 'leads' && store.fail.leadsUpdate) {
          return { data: null, error: { message: 'Only admins may change account_balance or kyc_status' } };
        }
        for (const r of rows()) Object.assign(r, payload);
        return { data: null, error: null };
      }
      if (op === 'delete') {
        const doomed = new Set(rows());
        const t = tableOf(name);
        for (let i = t.length - 1; i >= 0; i--) if (doomed.has(t[i])) t.splice(i, 1);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  };
  if (selected) { /* keep chain */ }
  return api;
}

export function createClient() {
  return {
    from(name) {
      return {
        select: () => query(name, 'select'),
        insert: p => query(name, 'insert', p),
        update: p => query(name, 'update', p),
        delete: () => query(name, 'delete'),
      };
    },
    storage: {
      from() {
        return {
          async upload(path, bytes) {
            if (store.fail.upload) return { error: { message: 'forced storage failure' } };
            store.objects.set(path, bytes.byteLength ?? bytes.length);
            return { error: null };
          },
          remove(paths) {
            for (const p of paths) store.objects.delete(p);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
    async rpc(name, args) {
      const k = args?.p_submission_key;
      if (name === 'claim_deposit_submission') {
        if (store.claims.has(k)) { store.claims.set(k, store.claims.get(k) + 1); return { data: false, error: null }; }
        store.claims.set(k, 0); return { data: true, error: null };
      }
      if (name === 'release_deposit_submission') { store.claims.delete(k); return { data: null, error: null }; }
      return { data: null, error: null };
    },
  };
}
