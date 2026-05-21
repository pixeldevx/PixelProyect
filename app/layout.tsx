import type {Metadata} from 'next';
import './globals.css'; // Global styles
import { Toaster } from 'sonner';

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
          {children}
          <Toaster position="top-right" richColors />
        </ErrorBoundary>
      </body>
    </html>
  );
}
