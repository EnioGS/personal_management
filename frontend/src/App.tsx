import { useEffect } from 'react'
import { ChatPanel } from '@/components/chat/chat-panel'
import { AppShell } from '@/components/layout/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { migrateExistingEntriesToIngestion } from '@/lib/model/ingestion-migration'

function App() {
  useEffect(() => {
    void migrateExistingEntriesToIngestion()
  }, [])

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell />
      <ChatPanel />
    </TooltipProvider>
  )
}

export default App
