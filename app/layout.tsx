import type {Metadata} from 'next';
import './globals.css'; // Global styles
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'RealProyect',
  description: 'Project & Performance Accounting platform',
};

import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ErrorBoundary>
          {children}
          <Toaster position="top-right" richColors />
        </ErrorBoundary>
      </body>
    </html>
  );
}
