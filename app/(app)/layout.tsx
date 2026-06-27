import { requireAppAuth } from "../../lib/require-app-auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAppAuth();
  return children;
}
