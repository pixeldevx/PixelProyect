"use client"

import { useState, useEffect } from 'react';
import { User, signInWithPopup, GoogleAuthProvider, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("Setting up onAuthStateChanged listener");
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      console.log("Auth state changed, user:", currentUser?.email);
      if (currentUser) {
        // Check if they are in team_members or admin
        try {
          const userEmail = currentUser.email?.toLowerCase();
          const isAdmin = userEmail === 'ing.zambranog@gmail.com';
          console.log("Is admin:", isAdmin);
          
          if (!isAdmin) {
            const { collection, query, where, getDocs } = await import('firebase/firestore');
            const q = query(collection(db, 'team_members'), where('email', '==', userEmail));
            const querySnapshot = await getDocs(q);
            console.log("Team members query snapshot empty:", querySnapshot.empty);
            
            if (querySnapshot.empty) {
              // Not in team_members, sign out and throw error
              await signOut(auth);
              setUser(null);
              setLoading(false);
              return;
            }
          }
          
          // Check if there's a pre-registered user document with this email
          let userRole = isAdmin ? 'admin' : 'user';
          const { collection, query, where, getDocs, deleteDoc } = await import('firebase/firestore');
          const qUsers = query(collection(db, 'users'), where('email', '==', currentUser.email?.toLowerCase()));
          const usersSnapshot = await getDocs(qUsers);
          
          if (!usersSnapshot.empty) {
            // Find if any of these is a pre-registered user (different ID than current uid)
            for (const docSnap of usersSnapshot.docs) {
              if (docSnap.id !== currentUser.uid) {
                const data = docSnap.data();
                if (data.role) {
                  userRole = data.role;
                }
                // Delete the pre-registered document
                await deleteDoc(docSnap.ref);
              } else {
                // If the document already exists with the correct UID, keep its role
                const data = docSnap.data();
                if (data.role) {
                  userRole = data.role;
                }
              }
            }
          }

          // Save or update user profile in Firestore
          const userRef = doc(db, 'users', currentUser.uid);
          await setDoc(userRef, {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName || currentUser.email?.split('@')[0],
            photoURL: currentUser.photoURL,
            lastLoginAt: serverTimestamp(),
            role: userRole, // Ensure role is preserved or set from pre-registration
          }, { merge: true });
          console.log("User profile saved/updated with role:", userRole);
          
          setUser(currentUser);
          setUserRole(userRole);
        } catch (error) {
          console.error("Error verifying user or saving profile:", error);
          // If there's an error (e.g., permission denied), we should probably log them out
          await signOut(auth);
          setUser(null);
          setUserRole(null);
        }
      } else {
        setUser(null);
        setUserRole(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in with Google", error);
      throw error;
    }
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
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Check if they are in team_members or admin
      const userEmail = email.toLowerCase();
      const isAdmin = userEmail === 'ing.zambranog@gmail.com';
      
      if (!isAdmin) {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const q = query(collection(db, 'team_members'), where('email', '==', userEmail));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          // Not in team_members, delete account and throw error
          const { deleteUser } = await import('firebase/auth');
          await deleteUser(userCredential.user);
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

  return { user, userRole, loading, login, loginWithEmail, registerWithEmail, logout };
}
