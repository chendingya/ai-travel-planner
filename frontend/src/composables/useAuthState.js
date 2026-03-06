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

const signOutAndSync = async () => {
  let backendError = null;
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    backendError = error;
  }

  const { error } = await supabase.auth.signOut({ scope: 'local' });
  user.value = null;
  authReady.value = true;
  return { error: error || backendError };
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
