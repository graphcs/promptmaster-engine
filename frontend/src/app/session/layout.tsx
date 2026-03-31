// Force dynamic rendering — session pages depend on Supabase runtime env vars
export const dynamic = 'force-dynamic';

import { SessionShell } from './session-shell';

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return <SessionShell>{children}</SessionShell>;
}
