import { useEffect } from 'react'
import { ChatPanel } from '@/components/chat/chat-panel'
import { AppShell } from '@/components/layout/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { migrateExistingEntriesToIngestion } from '@/lib/model/ingestion-migration'
import { alignDefaultTables, seedDefaultTables } from '@/lib/model/seed-tables'

/**
 * Work the app does to itself on the way up: fill in a vault that has no tables,
 * bring an older one into line with the current set, and queue any entry that has
 * never been through the ingestion centre.
 *
 * Each runs on its own and reports its own failure. They used to be one promise
 * chain, where the first rejection — a Dexie transaction losing a race with
 * StrictMode's second invocation, say — silently cancelled everything after it, and
 * the only symptom was a vault that never got corrected.
 */
async function prepareVault() {
  for (const step of [seedDefaultTables, alignDefaultTables, migrateExistingEntriesToIngestion]) {
    try {
      await step()
    } catch (error) {
      console.error(`Startup step ${step.name} failed`, error)
    }
  }
}

function App() {
  useEffect(() => {
    void prepareVault()
  }, [])

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell />
      <ChatPanel />
    </TooltipProvider>
  )
}

export default App
