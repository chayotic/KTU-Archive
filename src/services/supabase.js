import { SUPABASE_KEY, SUPABASE_URL } from '../config/supabase.js';

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

export async function selectRows(table, params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed with ${response.status}`);
  }

  return response.json();
}

export function publicObjectUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
