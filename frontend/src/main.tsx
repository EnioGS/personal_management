import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import { migrateLegacyData } from './lib/model/migrate-legacy-db'

// Fire-and-forget: the migration is additive and refreshes the stores itself when it
// writes anything, so rendering does not need to wait on it. A failure leaves the
// legacy databases untouched rather than blocking the app on a bad upgrade.
void migrateLegacyData().catch((err) => console.error('Legacy data migration failed', err))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
