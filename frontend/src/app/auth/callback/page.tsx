'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    // The Supabase client automatically handles the code exchange
    // when it detects the auth params in the URL hash/query
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_IN') {
        router.push('/session');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Completing sign in...</p>
    </div>
  );
}
