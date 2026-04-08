"use client"

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Users, 
  FileText, 
  Settings, 
  Bell, 
  Search,
  ChevronDown,
  LogOut,
  Mail,
  Lock,
  ChevronLeft,
  ChevronRight,
  Inbox
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, login, loginWithEmail, registerWithEmail, logout } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsSubmitting(true);
    
    try {
      if (isRegistering) {
        await registerWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setAuthError('Correo o contraseña incorrectos.');
      } else if (error.code === 'auth/email-already-in-use') {
        setAuthError('El correo ya está registrado. Por favor, inicia sesión.');
      } else if (error.code === 'auth/weak-password') {
        setAuthError('La contraseña debe tener al menos 6 caracteres.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setAuthError('El inicio de sesión con correo no está habilitado en Firebase. Por favor, habilítalo en la consola de Firebase.');
      } else {
        setAuthError(error.message || 'Ocurrió un error en la autenticación.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex h-screen w-full items-center justify-center">Cargando...</div>;
  }

  if (!user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-md">
              RP
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Bienvenido a RealProyect</h1>
            <p className="text-slate-500">Inicia sesión para gestionar tus proyectos y documentos.</p>
          </div>

          {authError && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg text-center">
              {authError}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="tu@email.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5"
            >
              {isSubmitting ? 'Procesando...' : (isRegistering ? 'Configurar contraseña' : 'Iniciar sesión')}
            </Button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-slate-500">O continúa con</span>
            </div>
          </div>

          <Button 
            type="button"
            onClick={login} 
            variant="outline"
            className="w-full border-slate-300 text-slate-700 hover:bg-slate-50 py-2.5 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google
          </Button>

          <div className="mt-6 text-center text-sm text-slate-600">
            {isRegistering ? '¿Ya tienes contraseña?' : '¿Primera vez iniciando sesión?'}
            <button 
              onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}
              className="ml-1 text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {isRegistering ? 'Inicia sesión' : 'Configura tu contraseña'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className={`${isCollapsed ? 'w-20' : 'w-64'} border-r border-slate-200 bg-white flex flex-col transition-all duration-300 ease-in-out relative z-30`}>
        <div className={`h-16 flex items-center ${isCollapsed ? 'justify-center' : 'px-6'} border-b border-slate-200`}>
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight overflow-hidden">
            <div className="w-8 h-8 bg-indigo-600 rounded-md flex items-center justify-center text-white shrink-0">
              RP
            </div>
            {!isCollapsed && <span className="whitespace-nowrap">RealProyect</span>}
          </div>
          
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`absolute -right-3 top-20 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-200 shadow-sm z-10 transition-all ${isCollapsed ? 'rotate-180' : ''}`}
            title={isCollapsed ? "Expandir" : "Colapsar"}
          >
            <ChevronLeft size={14} />
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto overflow-x-hidden">
          {!isCollapsed && (
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-4 px-2 whitespace-nowrap">
              Overview
            </div>
          )}
          <NavItem href="/dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard" active={pathname === '/dashboard'} collapsed={isCollapsed} />
          <NavItem href="/workflows" icon={<Inbox size={18} />} label="Bandeja Workflows" active={pathname?.startsWith('/workflows')} collapsed={isCollapsed} />
          <NavItem href="/projects" icon={<FolderKanban size={18} />} label="Projects" active={pathname?.startsWith('/projects')} collapsed={isCollapsed} />
          <NavItem href="/team" icon={<Users size={18} />} label="Team Performance" active={pathname?.startsWith('/team')} collapsed={isCollapsed} />
          <NavItem href="/alerts" icon={<Bell size={18} />} label="Alertas" active={pathname?.startsWith('/alerts')} collapsed={isCollapsed} />
          
          {!isCollapsed && (
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-8 px-2 whitespace-nowrap">
              Finance & Billing
            </div>
          )}
          <NavItem href="/settlements" icon={<FileText size={18} />} label="Settlements" active={pathname?.startsWith('/settlements')} collapsed={isCollapsed} />
          <NavItem href="/rate-cards" icon={<FileText size={18} />} label="Rate Cards" active={pathname?.startsWith('/rate-cards')} collapsed={isCollapsed} />
          
          {!isCollapsed && (
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-8 px-2 whitespace-nowrap">
              System
            </div>
          )}
          <NavItem href="/settings" icon={<Settings size={18} />} label="Settings" active={pathname?.startsWith('/settings')} collapsed={isCollapsed} />
        </nav>
        
        <div className="p-4 border-t border-slate-200">
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-2'} py-2 rounded-md hover:bg-slate-100 transition-colors group relative`}>
            <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden shrink-0 relative">
              {user.photoURL ? (
                <Image 
                  src={user.photoURL} 
                  alt={user.displayName || 'User'} 
                  fill
                  className="object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">
                  {user.displayName?.charAt(0) || 'U'}
                </div>
              )}
            </div>
            {!isCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{user.displayName || 'Usuario'}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
                <button onClick={logout} className="text-slate-400 hover:text-red-500 transition-colors" title="Cerrar sesión">
                  <LogOut size={16} />
                </button>
              </>
            )}
            {isCollapsed && (
              <button 
                onClick={logout} 
                className="absolute -top-2 -right-2 w-5 h-5 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                title="Cerrar sesión"
              >
                <LogOut size={10} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search projects, people..." 
                className="w-full h-9 pl-9 pr-4 rounded-md border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative text-slate-500">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </Button>
            
            <div className="h-6 w-px bg-slate-200 mx-2"></div>
            
            <div className="flex items-center gap-2 text-sm font-medium cursor-pointer hover:text-indigo-600 transition-colors">
              <span>View as: Project Manager</span>
              <ChevronDown size={16} className="text-slate-400" />
            </div>
          </div>
        </header>
        
        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ href, icon, label, active, collapsed }: { href: string, icon: React.ReactNode, label: string, active?: boolean, collapsed?: boolean }) {
  return (
    <Link 
      href={href} 
      className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-3'} py-2 rounded-md transition-all text-sm font-medium ${
        active 
          ? 'bg-indigo-50 text-indigo-700' 
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
      title={collapsed ? label : undefined}
    >
      <span className={`${active ? 'text-indigo-600' : 'text-slate-400'} shrink-0`}>{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
