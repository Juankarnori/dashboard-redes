"use client";

import { useState } from "react";
import { Sidebar, MobileTopBar } from "@/components/dashboard/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <MobileTopBar onOpenMenu={() => setOpen(true)} />
        {children}
      </div>
    </div>
  );
}
