import { ReactNode } from 'react';
import { ApplicationShell } from '@/components/layout/application-shell';

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <ApplicationShell>{children}</ApplicationShell>;
}
