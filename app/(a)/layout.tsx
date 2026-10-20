import AppShell from "@/components/AppShell";

export default function ALayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
