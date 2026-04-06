import { createClient } from "@supabase/supabase-js";

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function saveJobPending(supabase, { payload }) {
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      job_type: "telegram_ingest",
      payload,
      status: "pending"
    })
    .select("id")
    .single();

  if (error) throw new Error(`jobs insert: ${error.message}`);
  return data.id;
}

export async function saveMessage(supabase, row) {
  const { data, error } = await supabase
    .from("messages")
    .insert(row)
    .select("id")
    .single();

  if (error) throw new Error(`messages insert: ${error.message}`);
  return data.id;
}

export async function updateJob(supabase, jobId, fields) {
  const { error } = await supabase
    .from("jobs")
    .update({
      ...fields,
      updated_at: new Date().toISOString()
    })
    .eq("id", jobId);

  if (error) throw new Error(`jobs update: ${error.message}`);
}
