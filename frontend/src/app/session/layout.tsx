'use client';

import { useState } from 'react';
import { AppSidebar } from '@/components/sidebar/app-sidebar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[280px] flex-col border-r bg-card">
        <AppSidebar />
      </aside>

      {/* Mobile sidebar (sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-2 border-b bg-card px-4 py-2">
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-4 w-4" />
              </Button>
            }
          />
          <span className="text-sm font-semibold">PromptMaster</span>
        </div>
        <SheetContent side="left" className="w-[280px] p-0">
          <AppSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto md:p-0 pt-12 md:pt-0">
        <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
