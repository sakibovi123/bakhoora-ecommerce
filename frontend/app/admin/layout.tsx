import type { Metadata } from "next";

import { ConfirmProvider } from "@/components/admin/dialog";
import { AdminShell } from "@/components/admin/shell";
import { ToastProvider } from "@/components/admin/toast";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s — Bakhoora Admin" },
  description: "Bakhoora back office.",
  // The storefront's card belongs to the storefront.
  openGraph: null,
  twitter: null,
  // Never let a search engine index the back office.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-theme">
      <ToastProvider>
        <ConfirmProvider>
          <AdminShell>{children}</AdminShell>
        </ConfirmProvider>
      </ToastProvider>
    </div>
  );
}
