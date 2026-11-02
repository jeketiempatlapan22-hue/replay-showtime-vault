import { createClient } from '@supabase/supabase-js';
import type { Database } from './supabase/types';

// Website B shares Website A's backend (tokens, payments, IDN keys live there).
export const supabase = createClient<Database>(
  'https://zkuxrztgotfenywmopjn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdXhyenRnb3RmZW55d21vcGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjAwMDYsImV4cCI6MjA4OTQ5NjAwNn0.iMpOsIvkAgOePMarh2V2VoNEMcN98uJ7jiIOe2BZMnY',
  { auth: { storage: localStorage, persistSession: true, autoRefreshToken: true } },
);
