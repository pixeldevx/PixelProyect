"use client"

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, signOut, signInWithEmailAndPassword, resetPasswordForEmail } from '@/lib/supabase/auth-shim';
import { doc, setDoc, serverTimestamp } from '@/lib/supabase/document-store';
import { auth, db } from '@/lib/backend';

type AuthContextValue = {
  user: User | null;
  userRole: string | null;
  userOrganizationId: string | null;
  loading: boolean;
  accessError: string;
  login: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function useAuthState(): AuthContextValue {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userOrganizationId, setUserOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    console.log("Setting up onAuthStateChanged listener");
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      console.log("Auth state changed, user:", currentUser?.email);
      if (currentUser) {
        try {
          const userEmail = currentUser.email?.toLowerCase();
          const isAdmin = userEmail === 'ing.zambranog@gmail.com';
          
          let userRole = isAdmin ? 'admin' : 'user';
          let orgId: string | null = null;

          const { collection, query, where, getDocs, deleteDoc } = await import('@/lib/supabase/document-store');

          // Check if there's a pre-registered user document with this email
          const qUsers = query(collection(db, 'users'), where('email', '==', currentUser.email?.toLowerCase()));
          const usersSnapshot = await getDocs(qUsers);
          
          if (!usersSnapshot.empty) {
            for (const docSnap of usersSnapshot.docs) {
              if (docSnap.id !== currentUser.uid) {
                const data = docSnap.data();
                if (data.role) userRole = data.role;
                if (data.organizationId) orgId = data.organizationId;
                await deleteDoc(docSnap.ref);
              } else {
                const data = docSnap.data();
                if (data.role) userRole = data.role;
                if (data.organizationId) orgId = data.organizationId;
              }
            }
          }

          if (!isAdmin && !orgId && userRole !== 'admin') {
            // Check team_members if users doc didn't give orgId
            const q = query(collection(db, 'team_members'), where('email', '==', userEmail));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
              setAccessError('Tu usuario existe en Supabase Auth, pero todavía no tiene perfil activo en la app. Pídele al administrador que lo cree en Usuarios del Sistema.');
              await signOut(auth);
              setUser(null);
              setLoading(false);
              return;
            } else {
              orgId = querySnapshot.docs[0].data().organizationId || null;
            }
          }

          // Save or update user profile in Supabase.
          const userRef = doc(db, 'users', currentUser.uid);
          await setDoc(userRef, {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName || currentUser.email?.split('@')[0],
            photoURL: currentUser.photoURL,
            lastLoginAt: serverTimestamp(),
            isPreRegistered: false,
            role: userRole,
            ...(orgId ? { organizationId: orgId } : {})
          }, { merge: true });
          
          setUser(currentUser);
          setUserRole(userRole);
          setUserOrganizationId(orgId);
          setAccessError('');
        } catch (error) {
          console.error("Error verifying user or saving profile:", error);
          setAccessError('No fue posible verificar tu perfil en Supabase. Revisa que tu usuario exista en Usuarios del Sistema.');
          await signOut(auth);
          setUser(null);
          setUserRole(null);
          setUserOrganizationId(null);
        }
      } else {
        setUser(null);
        setUserRole(null);
        setUserOrganizationId(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    throw new Error('El acceso con proveedores externos fue deshabilitado. Usa correo y contraseña con Supabase.');
  };

  const loginWithEmail = async (email: string, password: string) => {
    try {
      setAccessError('');
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Error signing in with email", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const requestPasswordReset = async (email: string) => {
    const redirectTo = `${window.location.origin}/reset-password`;
    await resetPasswordForEmail(auth, email, redirectTo);
  };

  return { user, userRole, userOrganizationId, loading, accessError, login, loginWithEmail, requestPasswordReset, logout };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useAuthState();

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.');
  }

  return context;
}
