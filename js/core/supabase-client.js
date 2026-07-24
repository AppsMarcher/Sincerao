// core/supabase-client.js — conexão com Supabase e helper genérico de fetch REST

const SUPABASE_URL = window.AVD_SUPABASE.projectUrl;
const SUPABASE_KEY = window.AVD_SUPABASE.anonKey;

const _sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { detectSessionInUrl: false },
});

async function getSupabaseAccessToken() {
  const { data } = await _sbClient.auth.getSession();
  return data?.session?.access_token || SUPABASE_KEY;
}

async function sbHeaders(opts = {}) {
  const token = await getSupabaseAccessToken();
  return {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    Prefer: opts.prefer || 'return=representation',
  };
}

async function sbFetch(path, opts = {}) {
  const headers = await sbHeaders(opts);
  const r = await fetch(SUPABASE_URL + '/rest/v1' + path, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
  });
  if (!r.ok) {
    const e = await r.text();
    console.error('SB erro:', e);
    throw new Error(e);
  }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

async function sbInvokeFunction(name, payload = {}) {
  const token = await getSupabaseAccessToken();
  const r = await fetch(SUPABASE_URL + '/functions/v1/' + name, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const txt = await r.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!r.ok) throw new Error(data?.error || 'Erro ao chamar ' + name);
  return data;
}
