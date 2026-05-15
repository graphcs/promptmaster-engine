import { createClient } from './client';
import type { CustomMode, CustomModeInput } from '@/types';

export async function listCustomModes(): Promise<CustomMode[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('custom_modes')
    .select('id, user_id, name, preamble, tone, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as CustomMode[];
}

export async function getCustomMode(id: string): Promise<CustomMode | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('custom_modes')
    .select('id, user_id, name, preamble, tone, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as CustomMode;
}

export async function createCustomMode(
  input: CustomModeInput,
  userId: string
): Promise<CustomMode> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('custom_modes')
    .insert({
      user_id: userId,
      name: input.name.trim(),
      preamble: input.preamble.trim(),
      tone: input.tone.trim(),
    })
    .select('id, user_id, name, preamble, tone, created_at, updated_at')
    .single();

  if (error || !data) throw error ?? new Error('Failed to create custom mode');
  return data as CustomMode;
}

export async function updateCustomMode(
  id: string,
  input: CustomModeInput
): Promise<CustomMode> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('custom_modes')
    .update({
      name: input.name.trim(),
      preamble: input.preamble.trim(),
      tone: input.tone.trim(),
    })
    .eq('id', id)
    .select('id, user_id, name, preamble, tone, created_at, updated_at')
    .single();

  if (error || !data) throw error ?? new Error('Failed to update custom mode');
  return data as CustomMode;
}

export async function deleteCustomMode(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('custom_modes')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
