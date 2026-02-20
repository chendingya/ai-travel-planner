const { createClient } = require('@supabase/supabase-js');

/**
 * Supabase 客户端
 */
const { config } = require('./config');

if (!config.supabase.url || !config.supabase.key) {
  console.warn('Supabase configuration is missing. Some features may not work.');
}

const parseProjectRefFromUrl = (url) => {
  try {
    const host = new URL(String(url || '')).hostname || '';
    const m = host.match(/^([^.]+)\.supabase\.co$/i);
    return m ? m[1] : '';
  } catch (_) {
    return '';
  }
};

const parseJwtPayload = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const normalized = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch (_) {
    return null;
  }
};

if (config.supabase.url && config.supabase.key) {
  const payload = parseJwtPayload(config.supabase.key);
  const keyRole = payload?.role || 'unknown';
  const keyRef = payload?.ref || '';
  const urlRef = parseProjectRefFromUrl(config.supabase.url);
  console.log(`[supabase] key_role=${keyRole} key_ref=${keyRef || 'unknown'} url_ref=${urlRef || 'unknown'}`);
  if (keyRef && urlRef && keyRef !== urlRef) {
    console.warn('[supabase] key_ref and url_ref mismatch, this can cause "invalid token" errors.');
  }
}

const supabase = createClient(
  config.supabase.url,
  config.supabase.key
);

module.exports = supabase;
