"use client"

import { useState, useEffect } from 'react';
import { User, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '@/lib/supabase/auth-shim';
import { doc, setDoc, serverTimestamp } from '@/lib/supabase/document-store';
import { auth, db } from '@/lib/backend';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userOrganizationId, setUserOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
            role: userRole,
            ...(orgId ? { organizationId: orgId } : {})
          }, { merge: true });
          
          setUser(currentUser);
          setUserRole(userRole);
          setUserOrganizationId(orgId);
        } catch (error) {
          console.error("Error verifying user or saving profile:", error);
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
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Error signing in with email", error);
      throw error;
    }
  };

  const registerWithEmail = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      
      // Check if they are in team_members or admin
      const userEmail = email.toLowerCase();
      const isAdmin = userEmail === 'ing.zambranog@gmail.com';
      
      if (!isAdmin) {
        const { collection, query, where, getDocs } = await import('@/lib/supabase/document-store');
        const q = query(collection(db, 'team_members'), where('email', '==', userEmail));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          // Supabase Auth user deletion requires a trusted server key.
          await signOut(auth);
          throw new Error('Tu correo no está registrado en el equipo. Contacta al administrador.');
        }
      }
    } catch (error) {
      console.error("Error registering with email", error);
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

  return { user, userRole, userOrganizationId, loading, login, loginWithEmail, registerWithEmail, logout };
}
