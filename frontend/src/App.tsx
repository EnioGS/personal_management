import { ChatPanel } from '@/components/chat/chat-panel'
import { AppShell } from '@/components/layout/app-shell'
import { TooltipProvider } from '@/components/ui/tooltip'

function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <AppShell />
      <ChatPanel />
    </TooltipProvider>
  )
}

export default App
