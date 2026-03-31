'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { TopNav } from '@/components/layout/top-nav';

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <TopNav />
      <main className="ml-[260px] pt-24 pb-20 px-8 flex-1">
        <div className="content-well">
          {children}
        </div>
      </main>
    </div>
  );
}
