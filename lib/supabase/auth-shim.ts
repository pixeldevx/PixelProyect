import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from './client';

const SESSION_LOAD_TIMEOUT_MS = 10000;

export interface User {
  uid: string;
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId: string | null;
  providerData: {
    providerId: string;
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
  }[];
}

const mapUser = (user: SupabaseUser | null): User | null => {
  if (!user) return null;

  const metadata = user.user_metadata || {};
  const displayName =
    metadata.displayName ||
    metadata.full_name ||
    metadata.name ||
    user.email?.split('@')[0] ||
    null;
  const photoURL = metadata.photoURL || metadata.avatar_url || metadata.picture || null;

  return {
    uid: user.id,
    id: user.id,
    email: user.email || null,
    displayName,
    photoURL,
    emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at),
    isAnonymous: Boolean(user.is_anonymous),
    tenantId: null,
    providerData:
      user.identities?.map((identity) => ({
        providerId: identity.provider,
        displayName,
        email: user.email || null,
        photoURL,
      })) || [],
  };
};

type AuthListener = (user: User | null) => void | Promise<void>;

const withTimeout = async <T,>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const runAuthListener = (callback: AuthListener, user: User | null) => {
  void Promise.resolve()
    .then(() => callback(user))
    .catch((error) => {
      console.error('Error running Supabase auth listener:', error);
    });
};

class SupabaseAuthShim {
  currentUser: User | null = null;

  onAuthStateChanged(callback: AuthListener) {
    let active = true;

    const emitInitialSession = async () => {
      try {
        const { data } = await withTimeout(
          supabase.auth.getSession(),
          SESSION_LOAD_TIMEOUT_MS,
          'Supabase tardó demasiado cargando la sesión guardada.'
        );
        if (!active) return;
        this.currentUser = mapUser(data.session?.user || null);
        runAuthListener(callback, this.currentUser);
      } catch (error) {
        console.error('Error loading Supabase session:', error);
        if (!active) return;
        this.currentUser = null;
        runAuthListener(callback, null);
      }
    };

    void emitInitialSession();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      this.currentUser = mapUser(session?.user || null);
      runAuthListener(callback, this.currentUser);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }
}

export const auth = new SupabaseAuthShim();

export const signInWithEmailAndPassword = async (
  _auth: SupabaseAuthShim,
  email: string,
  password: string
) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  auth.currentUser = mapUser(data.user);
  return { user: auth.currentUser };
};

export const resetPasswordForEmail = async (
  _auth: SupabaseAuthShim,
  email: string,
  redirectTo: string
) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
  return data;
};

export const signOut = async (_auth?: SupabaseAuthShim) => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  auth.currentUser = null;
};

export const clearLocalAuthState = () => {
  auth.currentUser = null;

  if (typeof window === 'undefined') return;

  Object.keys(window.localStorage)
    .filter((key) => (key.startsWith('sb-') && key.includes('-auth-token')) || key === 'supabase.auth.token')
    .forEach((key) => window.localStorage.removeItem(key));
};

export const updateProfile = async (
  user: User,
  profile: { displayName?: string | null; photoURL?: string | null }
) => {
  const { data, error } = await supabase.auth.updateUser({
    data: {
      displayName: profile.displayName ?? user.displayName,
      photoURL: profile.photoURL ?? user.photoURL,
    },
  });
  if (error) throw error;
  auth.currentUser = mapUser(data.user);
};

export const updatePassword = async (password: string) => {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  auth.currentUser = mapUser(data.user);
  return { user: auth.currentUser };
};

export const deleteUser = async (_user?: User | null) => {
  throw new Error('La eliminación de usuarios de Auth debe realizarse desde el servidor de Supabase.');
};
