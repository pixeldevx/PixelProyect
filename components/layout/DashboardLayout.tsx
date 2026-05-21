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
import { ProfileModal } from '@/components/settings/ProfileModal';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, userRole, loading, loginWithEmail, registerWithEmail, requestPasswordReset, logout } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    setIsSubmitting(true);
    
    try {
      if (isRecoveringPassword) {
        await requestPasswordReset(email);
        setAuthMessage('Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo.');
      } else if (isRegistering) {
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
        setAuthError('El inicio de sesión con correo no está habilitado en Supabase. Por favor, habilítalo en la consola de Supabase.');
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
              PX
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Bienvenido a Pixel Project</h1>
            <p className="text-slate-500">Inicia sesión para gestionar tus proyectos y documentos.</p>
          </div>

          {authMessage && (
            <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg text-center">
              {authMessage}
            </div>
          )}

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
            {!isRecoveringPassword && (
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
            )}
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5"
            >
              {isSubmitting ? 'Procesando...' : isRecoveringPassword ? 'Enviar enlace' : (isRegistering ? 'Configurar contraseña' : 'Iniciar sesión')}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-600">
            {isRecoveringPassword ? '¿Recordaste tu contraseña?' : isRegistering ? '¿Ya tienes contraseña?' : '¿Primera vez iniciando sesión?'}
            <button 
              onClick={() => {
                setIsRegistering(isRecoveringPassword ? false : !isRegistering);
                setIsRecoveringPassword(false);
                setAuthError('');
                setAuthMessage('');
              }}
              className="ml-1 text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {isRecoveringPassword ? 'Inicia sesión' : isRegistering ? 'Inicia sesión' : 'Configura tu contraseña'}
            </button>
          </div>

          {!isRegistering && !isRecoveringPassword && (
            <div className="mt-3 text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  setIsRecoveringPassword(true);
                  setAuthError('');
                  setAuthMessage('');
                }}
                className="text-slate-500 hover:text-indigo-700 font-medium"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}
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
              PX
            </div>
            {!isCollapsed && <span className="whitespace-nowrap">Pixel Project</span>}
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
          <NavItem href="/billing" icon={<FileText size={18} />} label="Facturación" active={pathname?.startsWith('/billing')} collapsed={isCollapsed} />
          <NavItem href="/settlements" icon={<FileText size={18} />} label="Settlements" active={pathname?.startsWith('/settlements')} collapsed={isCollapsed} />
          <NavItem href="/rate-cards" icon={<FileText size={18} />} label="Rate Cards" active={pathname?.startsWith('/rate-cards')} collapsed={isCollapsed} />
          
          {userRole === 'admin' && !isCollapsed && (
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-8 px-2 whitespace-nowrap">
              System
            </div>
          )}
          {userRole === 'admin' && (
            <NavItem href="/settings" icon={<Settings size={18} />} label="Settings" active={pathname?.startsWith('/settings')} collapsed={isCollapsed} />
          )}
        </nav>
        
        <div className="p-4 border-t border-slate-200">
          <div 
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-2'} py-2 rounded-md hover:bg-slate-100 transition-colors group relative cursor-pointer`}
            onClick={() => setIsProfileModalOpen(true)}
          >
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
                <button 
                  onClick={(e) => { e.stopPropagation(); logout(); }} 
                  className="text-slate-400 hover:text-red-500 transition-colors" 
                  title="Cerrar sesión"
                >
                  <LogOut size={16} />
                </button>
              </>
            )}
            {isCollapsed && (
              <button 
                onClick={(e) => { e.stopPropagation(); logout(); }} 
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

      <ProfileModal 
        user={user} 
        isOpen={isProfileModalOpen} 
        onClose={() => setIsProfileModalOpen(false)} 
      />
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
