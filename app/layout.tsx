import type {Metadata} from 'next';
import './globals.css'; // Global styles
import { Toaster } from 'sonner';
import { AuthProvider } from '@/hooks/useAuth';

export const metadata: Metadata = {
  title: 'Pixel Project',
  description: 'Project & Performance Accounting platform',
};

import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className="font-sans" suppressHydrationWarning>
        <ErrorBoundary>
          <AuthProvider>
            {children}
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
