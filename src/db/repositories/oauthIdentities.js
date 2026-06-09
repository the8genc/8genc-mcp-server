/** Linked social identities (Google/GitHub) → users. */
import { query } from '../pool.js';

export async function findUserIdByProvider(provider, providerUserId) {
  const { rows } = await query(
    'SELECT user_id FROM oauth_identities WHERE provider = $1 AND provider_user_id = $2',
    [provider, providerUserId]
  );
  return rows[0]?.user_id || null;
}

export async function link({ userId, provider, providerUserId }) {
  await query(
    `INSERT INTO oauth_identities (user_id, provider, provider_user_id)
     VALUES ($1, $2, $3) ON CONFLICT (provider, provider_user_id) DO NOTHING`,
    [userId, provider, providerUserId]
  );
}
