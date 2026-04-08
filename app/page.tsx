"use client"

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { 
  ArrowRight, 
  LayoutDashboard, 
  FolderKanban, 
  FileText, 
  TrendingUp, 
  ShieldCheck, 
  Zap,
  CheckCircle2,
  BarChart3,
  Users
} from 'lucide-react';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">
                RP
              </div>
              <span className="text-xl font-bold text-slate-900 tracking-tight">RealProyect</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">Características</a>
              <a href="#how-it-works" className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">Cómo Funciona</a>
              <a href="#benefits" className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">Beneficios</a>
            </div>
            <div className="flex items-center gap-4">
              <Link 
                href="/dashboard" 
                className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors hidden sm:block"
              >
                Iniciar Sesión
              </Link>
              <Link 
                href="/dashboard" 
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
              >
                Comenzar Ahora
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden relative">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none"></div>
        <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-indigo-50 to-transparent pointer-events-none"></div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-medium mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse"></span>
              La nueva forma de gestionar proyectos
            </div>
            <h1 className="text-5xl lg:text-7xl font-extrabold text-slate-900 tracking-tight mb-8 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100 leading-tight">
              Transforma el Caos en <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Control Absoluto</span>
            </h1>
            <p className="text-xl text-slate-600 mb-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 leading-relaxed">
              RealProyect centraliza tu operación. Gestiona tareas, controla presupuestos, aprueba flujos de trabajo y toma decisiones basadas en datos en tiempo real. Todo en un solo lugar.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
              <Link 
                href="/dashboard" 
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-base font-medium text-white bg-indigo-600 border border-transparent rounded-xl shadow-lg hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
              >
                Ir al Dashboard
                <ArrowRight className="ml-2 -mr-1 w-5 h-5" />
              </Link>
              <a 
                href="#features" 
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-base font-medium text-slate-700 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all"
              >
                Descubrir Funcionalidades
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Todo lo que necesitas para el éxito de tus proyectos</h2>
            <p className="text-lg text-slate-600">
              Diseñado para equipos de alto rendimiento que requieren trazabilidad, control financiero y ejecución impecable.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all group">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 mb-6 group-hover:scale-110 transition-transform">
                <LayoutDashboard className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Dashboard en Tiempo Real</h3>
              <p className="text-slate-600 leading-relaxed">
                Visualiza el estado de todos tus proyectos, KPIs, avance físico y financiero en un panel centralizado e intuitivo. Toma decisiones con datos actualizados al segundo.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all group">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-6 group-hover:scale-110 transition-transform">
                <FolderKanban className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Seguimiento de Tareas y Gantt</h3>
              <p className="text-slate-600 leading-relaxed">
                Planifica y ejecuta con precisión. Utiliza vistas de lista o diagramas de Gantt interactivos para gestionar dependencias, plazos y responsables de cada actividad.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all group">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Flujos de Trabajo (Workflows)</h3>
              <p className="text-slate-600 leading-relaxed">
                Diseña procesos de aprobación personalizados. El sistema registra cada ciclo de revisión, devoluciones y aprobaciones, manteniendo un historial inmutable de la trazabilidad.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all group">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 mb-6 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Control Financiero y Tarifarios</h3>
              <p className="text-slate-600 leading-relaxed">
                Vincula el trabajo directamente con el presupuesto. Mide unidades producidas, calcula costos, gestiona facturación y cuantifica el valor del retrabajo automáticamente.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all group">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Alertas Proactivas con IA</h3>
              <p className="text-slate-600 leading-relaxed">
                Deja que el sistema vigile por ti. Configura reglas automáticas para tareas atrasadas o inactivas, y recibe insights generados por IA sobre el rendimiento del proyecto.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all group">
              <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600 mb-6 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Gestión de Roles y Seguridad</h3>
              <p className="text-slate-600 leading-relaxed">
                Seguridad de nivel empresarial. Controla el acceso con precisión mediante roles de sistema globales y cargos específicos por proyecto para cada miembro de tu equipo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Deep Dive Section */}
      <section id="how-it-works" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="lg:w-1/2">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">La Metodología RealProyect</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                No somos solo una lista de tareas. Entendemos que el trabajo real requiere procesos iterativos y control financiero estricto.
              </p>
              
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <CheckCircle2 className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-900 mb-1">Trazabilidad Cíclica</h4>
                    <p className="text-slate-600">A diferencia de otras herramientas, guardamos un historial inmutable de cada ciclo de revisión. Mide la eficiencia real y detecta cuellos de botella.</p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <BarChart3 className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-900 mb-1">Monetización del Esfuerzo</h4>
                    <p className="text-slate-600">El seguimiento no es solo de tiempo, es de valor. Al aprobar tareas, se suman unidades al tarifario, permitiendo saber cuánto dinero se ha ejecutado y cuánto cuesta el retrabajo.</p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <Users className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-900 mb-1">Colaboración sin Fricción</h4>
                    <p className="text-slate-600">Centraliza documentos, comentarios y aprobaciones en el mismo contexto de la tarea. Elimina los hilos de correo interminables.</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="lg:w-1/2 w-full">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-2 overflow-hidden transform rotate-1 hover:rotate-0 transition-transform duration-500">
                <div className="bg-slate-100 rounded-xl h-96 w-full flex items-center justify-center border border-slate-200 relative overflow-hidden">
                  {/* Abstract UI Representation */}
                  <div className="absolute inset-0 p-6 flex flex-col gap-4 opacity-80">
                    <div className="h-8 w-1/3 bg-slate-200 rounded-md"></div>
                    <div className="flex gap-4 h-24">
                      <div className="flex-1 bg-indigo-100 rounded-lg border border-indigo-200"></div>
                      <div className="flex-1 bg-emerald-100 rounded-lg border border-emerald-200"></div>
                      <div className="flex-1 bg-amber-100 rounded-lg border border-amber-200"></div>
                    </div>
                    <div className="flex-1 bg-white rounded-lg border border-slate-200 p-4 flex flex-col gap-3">
                      <div className="h-4 w-1/4 bg-slate-200 rounded"></div>
                      <div className="h-10 w-full bg-slate-50 border border-slate-100 rounded-md"></div>
                      <div className="h-10 w-full bg-slate-50 border border-slate-100 rounded-md"></div>
                      <div className="h-10 w-full bg-slate-50 border border-slate-100 rounded-md"></div>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-white/80 to-transparent flex items-end justify-center pb-8">
                    <span className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-full shadow-lg">
                      Interfaz Intuitiva y Poderosa
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-indigo-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-violet-600 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <h2 className="text-4xl font-extrabold text-white mb-6">
            ¿Listo para tomar el control de tus proyectos?
          </h2>
          <p className="text-xl text-indigo-200 mb-10">
            Únete a los equipos que ya están transformando su manera de trabajar, optimizando presupuestos y entregando a tiempo.
          </p>
          <Link 
            href="/dashboard" 
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-indigo-900 bg-white border border-transparent rounded-xl shadow-xl hover:bg-indigo-50 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-indigo-900 focus:ring-white transition-all"
          >
            Comenzar Ahora
            <ArrowRight className="ml-2 -mr-1 w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">
              RP
            </div>
            <span className="text-xl font-bold text-white tracking-tight">RealProyect</span>
          </div>
          <p className="text-slate-400 text-sm text-center md:text-left">
            © {new Date().getFullYear()} RealProyect. Todos los derechos reservados.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Términos</a>
            <a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Privacidad</a>
            <a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Contacto</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
