import { useEffect } from 'react'
import { ChatPanel } from '@/components/chat/chat-panel'
import { AppShell } from '@/components/layout/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { migrateExistingEntriesToIngestion } from '@/lib/model/ingestion-migration'
import { seedDefaultTables } from '@/lib/model/seed-tables'

function App() {
  useEffect(() => {
    void seedDefaultTables().then(() => migrateExistingEntriesToIngestion())
  }, [])

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell />
      <ChatPanel />
    </TooltipProvider>
  )
}

export default App
