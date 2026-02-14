import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, RefreshCw, ArrowRight, Wallet, Coins } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupHotWallet } from "@near-wallet-selector/hot-wallet";
import { actionCreators } from "@near-js/transactions";
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";

import { POPULAR_TOKENS, getAccountBalance, getTokenBalance, formatBalance } from '../utils/near-utils';

// --- Types ---
type Message = {
    id: string;
    role: 'user' | 'ai';
    content: string;
    action?: string;   // Optional: For handling transaction payloads later
    payload?: any;
};

type TokenBalance = {
    symbol: string;
    balance: string;
    icon?: string;
};

// --- Utils ---
function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

// --- Component ---
export default function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [sessionId, setSessionId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Wallet State
    const [selector, setSelector] = useState<WalletSelector | null>(null);
    const [modal, setModal] = useState<WalletSelectorModal | null>(null);
    const [accountId, setAccountId] = useState<string | null>(null);

    // Balance State
    const [balances, setBalances] = useState<TokenBalance[]>([]);

    // Initialize Session
    useEffect(() => {
        const newSessionId = uuidv4();
        console.log("Starting New Session:", newSessionId);
        setSessionId(newSessionId);
        setMessages([{
            id: 'init',
            role: 'ai',
            content: 'Hello! I am your AI Agent. How can I help you today? (e.g., "Swap 5 NEAR for ETH")'
        }]);
    }, []);



    // Initialize Wallet Selector
    useEffect(() => {
        setupWalletSelector({
            network: "mainnet",
            modules: [
                setupMyNearWallet(),
                setupMeteorWallet(),
                setupHereWallet(),
                setupHotWallet()
            ],
        }).then((selector) => {
            const modal = setupModal(selector, {
                contractId: "intent.near", // Default contract
            });
            setSelector(selector);
            setModal(modal);

            const state = selector.store.getState();
            const accounts = state.accounts;
            if (accounts.length > 0) {
                setAccountId(accounts[0].accountId);
            }

            // Subscribe to changes
            const subscription = selector.store.observable.subscribe((state) => {
                const accounts = state.accounts;
                setAccountId(accounts.length > 0 ? accounts[0].accountId : null);
            });

            return () => subscription.unsubscribe();
        }).catch(err => console.error("Failed to setup wallet selector", err));
    }, []);

    // Fetch Balances when Account Changes
    useEffect(() => {
        if (!accountId) {
            setBalances([]);
            return;
        }

        const fetchAllBalances = async () => {
            const newBalances: TokenBalance[] = [];

            for (const token of POPULAR_TOKENS) {
                let rawParams = "0";
                if (token.id === 'NEAR') {
                    rawParams = await getAccountBalance(accountId);
                } else {
                    rawParams = await getTokenBalance(accountId, token.id);
                }

                const fmt = formatBalance(rawParams, token.decimals);
                // Only show if > 0 (optional, but requested "available assets", usually implies non-zero)
                if (parseFloat(fmt) > 0) {
                    newBalances.push({
                        symbol: token.symbol,
                        balance: fmt,
                        icon: token.icon
                    });
                }
            }
            // If no tokens found, maybe at least show NEAR 0.00
            if (newBalances.length === 0) {
                const nearBal = await getAccountBalance(accountId);
                newBalances.push({ symbol: "NEAR", balance: formatBalance(nearBal, 24), icon: POPULAR_TOKENS[0].icon });
            }

            setBalances(newBalances);
        };

        fetchAllBalances();
    }, [accountId]);


    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleConnect = () => {
        if (modal) {
            modal.show();
        }
    };

    const handleDisconnect = async () => {
        if (selector) {
            const wallet = await selector.wallet();
            await wallet.signOut();
        }
    };

    const handleSignTransaction = async (payload: any) => {
        if (!selector || !accountId) {
            alert("Please connect your wallet first!");
            handleConnect();
            return;
        }

        try {
            const wallet = await selector.wallet();

            // Helper to transform actions
            const transformActions = (actions: any[]) => {
                return actions.map((action: any) => {
                    if (action.type === 'FunctionCall') {
                        return actionCreators.functionCall(
                            action.params.methodName,
                            action.params.args,
                            BigInt(action.params.gas),
                            BigInt(action.params.deposit)
                        );
                    }
                    return action;
                });
            };

            if (Array.isArray(payload)) {
                // Multi-transaction (Batch)
                const transactions = payload.map((tx: any) => ({
                    receiverId: tx.receiverId,
                    actions: transformActions(tx.actions)
                }));

                await wallet.signAndSendTransactions({
                    transactions: transactions
                });
            } else {
                // Single transaction
                const actions = transformActions(payload.actions);
                await wallet.signAndSendTransaction({
                    receiverId: payload.receiverId,
                    actions: actions
                });
            }

            setMessages(prev => [...prev, {
                id: uuidv4(),
                role: 'ai',
                content: "Transactions submitted! Check your wallet for status."
            }]);

        } catch (error) {
            console.error("Transaction Failed", error);
            alert("Transaction Failed: " + (error as Error).message);
        }
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg: Message = { id: uuidv4(), role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            // Call the python backend
            const response = await fetch('http://localhost:8000/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: userMsg.content,
                    session_id: sessionId,
                    account_id: accountId || null // Pass wallet ID if connected
                }),
            });

            const data = await response.json();

            const aiMsg: Message = {
                id: uuidv4(),
                role: 'ai',
                content: data.response,
                action: data.action,
                payload: data.payload
            };

            setMessages(prev => [...prev, aiMsg]);

        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, {
                id: uuidv4(),
                role: 'ai',
                content: "Sorry, I encountered an error connecting to the agent."
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // --- Render Helpers ---
    const renderContent = (msg: Message) => {
        return (
            <div className="flex flex-col gap-2">
                <p className="whitespace-pre-wrap leading-7">{msg.content}</p>
                {msg.action === 'CONFIRM_QUOTE' && msg.payload && (
                    <div className="bg-gray-800 p-4 rounded-lg mt-2 border border-gray-700">
                        <h4 className="font-semibold text-gray-200 mb-2">Quote Details</h4>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-400">
                            <span>Sell:</span> <span className="text-white">{msg.payload.amount} {msg.payload.in}</span>
                            <span>Buy:</span> <span className="text-white">~{msg.payload.est_out} {msg.payload.out}</span>
                        </div>
                    </div>
                )}
                {msg.action === 'SIGN_TRANSACTION' && (
                    <div className="mt-2">
                        <button
                            onClick={() => handleSignTransaction(msg.payload)}
                            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
                        >
                            Sign Transaction
                            <ArrowRight size={16} />
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex h-screen bg-[#343541] text-gray-100 font-sans overflow-hidden">

            {/* Left Sidebar (Balances) */}
            <div className="hidden md:flex flex-col w-64 bg-[#202123] border-r border-gray-700/50 p-4 gap-4">
                <div className="font-semibold text-gray-300 flex items-center gap-2 mb-2">
                    <Coins size={18} />
                    <span>Your Assets</span>
                </div>

                {!accountId && (
                    <div className="text-sm text-gray-500 italic">Connect wallet to view balances</div>
                )}

                {accountId && balances.length === 0 && (
                    <div className="text-sm text-gray-500 animate-pulse">Loading...</div>
                )}

                <div className="flex flex-col gap-2 overflow-y-auto scrollbar-hide">
                    {balances.map((t) => (
                        <div key={t.symbol} className="flex items-center justify-between bg-[#343541] p-2.5 rounded-lg border border-gray-700/50 hover:bg-[#2A2B32] transition-colors">
                            <div className="flex items-center gap-2.5">
                                {t.icon ? (
                                    <img src={t.icon} alt={t.symbol} className="w-6 h-6 rounded-full" />
                                ) : (
                                    <div className="w-6 h-6 bg-gray-600 rounded-full" />
                                )}
                                <span className="font-medium text-sm">{t.symbol}</span>
                            </div>
                            <span className="text-sm font-mono text-gray-300">{t.balance}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex flex-col flex-1 h-full relative">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700/50 bg-[#343541]">
                    <div className="font-semibold text-lg flex items-center gap-2">
                        <span>AI Agent</span>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Wallet Connect Button */}
                        <button
                            onClick={accountId ? handleDisconnect : handleConnect}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                                accountId
                                    ? "bg-gray-700 text-green-400 hover:bg-gray-600"
                                    : "bg-blue-600 text-white hover:bg-blue-700"
                            )}
                        >
                            <Wallet size={16} />
                            {accountId ? accountId : "Connect Wallet"}
                        </button>

                        <button
                            onClick={() => window.location.reload()}
                            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                            title="New Chat"
                        >
                            <RefreshCw size={20} />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto w-full max-w-3xl mx-auto p-4 space-y-6">
                    {messages.map((msg) => (
                        <div key={msg.id} className={cn(
                            "group w-full text-gray-100 border-b border-black/10 dark:border-gray-900/50",
                            msg.role === 'ai' ? "bg-[#444654]" : "bg-transparent"
                        )}>
                            <div className="flex gap-4 p-4 m-auto text-base md:gap-6 md:max-w-2xl lg:max-w-[38rem] xl:max-w-3xl">
                                <div className={cn(
                                    "relative flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-sm",
                                    msg.role === 'ai' ? "bg-green-500" : "bg-gray-500"
                                )}>
                                    {msg.role === 'ai' ? <Bot size={20} className="text-white" /> : <User size={20} className="text-white" />}
                                </div>
                                <div className="relative flex-1 overflow-hidden">
                                    {renderContent(msg)}
                                </div>
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="w-full bg-[#444654] border-b border-black/10 dark:border-gray-900/50">
                            <div className="flex gap-4 p-4 m-auto md:gap-6 md:max-w-2xl lg:max-w-[38rem] xl:max-w-3xl">
                                <div className="w-8 h-8 bg-green-500 rounded-sm flex items-center justify-center">
                                    <Bot size={20} className="text-white animate-pulse" />
                                </div>
                                <div className="flex items-center">
                                    <span className="animate-pulse">Thinking...</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} className="h-4" />
                </div>

                {/* Input Area */}
                <div className="w-full bg-[#343541] border-t border-gray-700/50 p-4 pb-8">
                    <div className="max-w-3xl mx-auto relative flex items-center w-full p-0">
                        <div className="relative flex w-full flex-grow flex-col rounded-md border border-black/10 bg-gray-700 shadow-[0_0_10px_rgba(0,0,0,0.10)] dark:border-gray-900/50 dark:bg-[#40414F] dark:text-white dark:shadow-[0_0_15px_rgba(0,0,0,0.10)]">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Send a message..."
                                className="m-0 w-full resize-none border-0 bg-transparent p-0 pl-4 pr-10 py-3 focus:ring-0 focus-visible:ring-0 md:py-4 md:pl-4 max-h-[200px] overflow-y-auto scrollbar-hide"
                                style={{ height: '56px' }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                                className="absolute right-2 bottom-2.5 p-1 rounded-md text-gray-400 hover:bg-gray-900 hover:text-gray-200 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                            >
                                <Send size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="text-xs text-center text-gray-500 mt-2">
                        AI Agent can make mistakes. Consider checking important information.
                    </div>
                </div>
            </div>
        </div>
    );
}

