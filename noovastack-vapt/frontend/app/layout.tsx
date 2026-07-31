import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { BRAND } from '@/lib/branding';
import './globals.css';

export const metadata: Metadata = {
  title: BRAND.productName,
  description: 'Secure vulnerability assessment made simple.',
  applicationName: BRAND.productName,
  icons: {
    icon: BRAND.assets.favicon,
    shortcut: BRAND.assets.favicon,
    apple: BRAND.assets.favicon,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var saved = localStorage.getItem('noovastack.theme');
            var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
            var theme = dark ? 'dark' : 'light';
            document.documentElement.classList.toggle('dark', dark);
            document.documentElement.dataset.theme = theme;
          } catch (_) {}
        ` }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
