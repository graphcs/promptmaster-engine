// Force all auth pages to be dynamically rendered (not statically generated)
// since they depend on Supabase client which requires runtime env vars.
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
