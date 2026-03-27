import { createClient } from './client';

export async function recordUsage(action: string = 'iteration'): Promise<void> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('usage_tracking')
      .insert({ user_id: user.id, action });
  } catch {
    // Silently fail — telemetry should never block the user
  }
}
