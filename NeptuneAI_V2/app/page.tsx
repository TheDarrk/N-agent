"use client";

import dynamic from "next/dynamic";

// Load WalletProvider + ChatInterface only on the client (no SSR)
// This avoids @hot-labs/kit CJS/ESM module conflicts during server rendering
const ClientApp = dynamic(
  () => import("@/components/client-app"),
  { ssr: false }
);

export default function Home() {
  return <ClientApp />;
}
