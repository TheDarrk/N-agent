"use client";

import WalletProvider from "@/providers/wallet-provider";
import ChatInterface from "@/components/chat-interface";
import RunHoldBanner from "@/components/run-hold-banner";

export default function ClientApp({ initialTab }: { initialTab?: string }) {
    return (
        <WalletProvider>
            <ChatInterface initialTab={initialTab} />
            <RunHoldBanner />
        </WalletProvider>
    );
}
