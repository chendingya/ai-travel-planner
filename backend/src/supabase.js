const { createClient } = require('@supabase/supabase-js');

/**
 * Supabase 客户端
 */
const { config } = require('./config');

if (!config.supabase.url || !config.supabase.key) {
  console.warn('Supabase configuration is missing. Some features may not work.');
}

const supabase = createClient(
  config.supabase.url,
  config.supabase.key
);

module.exports = supabase;
