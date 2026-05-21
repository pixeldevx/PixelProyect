import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from './client';

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

class SupabaseAuthShim {
  currentUser: User | null = null;

  onAuthStateChanged(callback: AuthListener) {
    let active = true;

    const emitInitialSession = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      this.currentUser = mapUser(data.user);
      await callback(this.currentUser);
    };

    void emitInitialSession();

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      this.currentUser = mapUser(session?.user || null);
      await callback(this.currentUser);
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

export const createUserWithEmailAndPassword = async (
  _auth: SupabaseAuthShim,
  email: string,
  password: string
) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        displayName: email.split('@')[0],
      },
    },
  });
  if (error) throw error;
  auth.currentUser = mapUser(data.user);
  return { user: auth.currentUser };
};

export const signOut = async (_auth?: SupabaseAuthShim) => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  auth.currentUser = null;
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

export const deleteUser = async (_user?: User | null) => {
  throw new Error('La eliminación de usuarios de Auth debe realizarse desde el servidor de Supabase.');
};
