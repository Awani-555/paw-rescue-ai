const STORAGE_KEY = 'pawrescue_device_id'

// Tier 1 (anonymous public helpers) has no account, so this is the only
// identity the backend ever sees for that flow: a random id generated
// once client-side and persisted, never tied to a name, email, or login.
export function getOrCreateDeviceId() {
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}
