import { ref } from 'vue';
import { supabase } from '../supabase';

const user = ref(null);
const authReady = ref(false);

let initialized = false;
let authSubscription = null;

const readSessionUser = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  user.value = session?.user || null;
  return session || null;
};

const refreshAuthState = async (options = {}) => {
  const { refreshSession = false } = options;
  try {
    if (refreshSession) {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data?.session?.user) {
        user.value = data.session.user;
        authReady.value = true;
        return data.session;
      }
    }
    const session = await readSessionUser();
    authReady.value = true;
    return session;
  } catch (error) {
    user.value = null;
    authReady.value = true;
    return null;
  }
};

const setSessionFromServer = async (session) => {
  if (!session?.access_token || !session?.refresh_token) return false;
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;
  await refreshAuthState({ refreshSession: true });
  return true;
};

const signOutAndSync = async () => {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  await refreshAuthState();
  return { error };
};

const patchUserMetadata = (patch = {}) => {
  if (!user.value) return;
  user.value = {
    ...user.value,
    user_metadata: {
      ...(user.value.user_metadata || {}),
      ...patch,
    },
  };
};

const ensureInitialized = () => {
  if (initialized) return;
  initialized = true;

  refreshAuthState();

  const result = supabase.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user || null;
    authReady.value = true;
  });

  authSubscription = result?.data?.subscription || result?.subscription || null;
};

ensureInitialized();

export const useAuthState = () => ({
  user,
  authReady,
  refreshAuthState,
  setSessionFromServer,
  signOutAndSync,
  patchUserMetadata,
});

export const disposeAuthState = () => {
  if (authSubscription && typeof authSubscription.unsubscribe === 'function') {
    authSubscription.unsubscribe();
  }
  authSubscription = null;
  initialized = false;
};
