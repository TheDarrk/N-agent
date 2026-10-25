"use client";

import dynamic from "next/dynamic";

const ClientApp = dynamic(
  () => import("@/components/client-app"),
  { ssr: false }
);

export default function ChatPage() {
  return <ClientApp initialTab="chat" />;
}
