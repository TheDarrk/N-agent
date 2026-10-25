"use client";

import WalletProvider from "@/providers/wallet-provider";
import ChatInterface from "@/components/chat-interface";

export default function ClientApp({ initialTab }: { initialTab?: string }) {
    return (
        <WalletProvider>
            <ChatInterface initialTab={initialTab} />
        </WalletProvider>
    );
}
