"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Key,
  Shield,
  TrendingUp,
  Scale,
  FileText,
  PlusCircle,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Cpu,
  Zap,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
  Sparkles,
  ArrowRight,
  Flame,
  BadgeAlert,
  Wallet,
  ArrowUpRight,
  Info,
  DollarSign,
  Eye,
  EyeOff,
  Lock
} from "lucide-react";
import { AgentAvatar } from "@/components/agent-avatars";
import { useWallet } from "@/providers/wallet-provider";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  accountId: string | null;
  onConnectWallet?: () => void;
};

interface AgentWallet {
  id: number;
  user_wallet: string;
  chain_type: string;
  public_key: string;
  agent_wallet_address: string;
  label: string;
  assigned_agents: string[];
  status: string;
  created_at: string;
  balance?: string;
  onchain_exists?: boolean;
}

interface AgentAssignments {
  trader: string;
  rebalancer: string;
  research: string;
  moderator: string;
}

export default function AgentWalletManagerModal({
  isOpen,
  onClose,
  accountId,
  onConnectWallet
}: Props) {
  const { signAndSendTransaction, network } = useWallet();

  const effectiveNetwork = accountId?.endsWith(".near")
    ? "mainnet"
    : accountId?.endsWith(".testnet")
    ? "testnet"
    : network || "mainnet";
  const isMain = effectiveNetwork === "mainnet";

  const [wallets, setWallets] = useState<AgentWallet[]>([]);
  const [balances, setBalances] = useState<Record<string, { formatted: string; exists: boolean }>>({});
  const [assignments, setAssignments] = useState<AgentAssignments>({
    trader: "",
    rebalancer: "",
    research: "",
    moderator: ""
  });
  const [allowCrossChain, setAllowCrossChain] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Creation & Import UI state
  const [isCreating, setIsCreating] = useState(false);
  const [isImportingView, setIsImportingView] = useState(false);

  // Creation wizard state
  const [creationMethod, setCreationMethod] = useState<"named_subaccount" | "implicit" | "evm_wallet">("named_subaccount");
  const [subaccountPrefix, setSubaccountPrefix] = useState("trader");
  const [subaccountLabel, setSubaccountLabel] = useState("");
  const [assignedAgentChoice, setAssignedAgentChoice] = useState("trader");
  const [fundingAmountNear, setFundingAmountNear] = useState("0.5");
  const [creationStep, setCreationStep] = useState<"idle" | "generating" | "signing" | "verifying" | "done">("idle");
  const [lastCreatedTxHash, setLastCreatedTxHash] = useState<string | null>(null);
  const [evmLabel, setEvmLabel] = useState("Trader Arbitrum / ETH Wallet");

  // Top-up deposit state
  const [topupTargetWallet, setTopupTargetWallet] = useState<AgentWallet | null>(null);
  const [topupAmount, setTopupAmount] = useState("0.5");
  const [isTopupBusy, setIsTopupBusy] = useState(false);

  // Withdraw funds state
  const [withdrawTargetWallet, setWithdrawTargetWallet] = useState<AgentWallet | null>(null);
  const [isWithdrawBusy, setIsWithdrawBusy] = useState(false);

  // Import form state
  const [importAccountId, setImportAccountId] = useState("");
  const [importSecret, setImportSecret] = useState("");
  const [importLabel, setImportLabel] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Architecture explainer toggle
  const [showArchitectureGuide, setShowArchitectureGuide] = useState(false);

  // Key export & backup state
  const [exportedKeyData, setExportedKeyData] = useState<{
    id: number;
    address: string;
    publicKey: string;
    privateKey: string;
    chain: string;
    label?: string;
    seedPhrase?: string | null;
  } | null>(null);
  const [isExportLoading, setIsExportLoading] = useState<number | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState<boolean>(false);

  const fetchBalancesForWallets = async (walletList: AgentWallet[]) => {
    const balMap: Record<string, { formatted: string; exists: boolean }> = {};
    for (const w of walletList) {
      const addr = w.agent_wallet_address;
      if (!addr) continue;
      try {
        const res = await fetch(`/api/agent-wallet/balance/${addr}`);
        if (res.ok) {
          const data = await res.json();
          balMap[addr] = {
            formatted: data.formatted || "0 NEAR",
            exists: data.exists !== false
          };
        }
      } catch {
        balMap[addr] = { formatted: "Unknown", exists: false };
      }
    }
    setBalances((prev) => ({ ...prev, ...balMap }));
  };

  const fetchConfig = useCallback(async () => {
    if (!accountId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/agent-wallet/config/${accountId}`);
      if (res.ok) {
        const data = await res.json();
        const loadedWallets: AgentWallet[] = data.wallets || [];
        setWallets(loadedWallets);
        if (data.assignments) {
          setAssignments({
            trader: data.assignments.trader || "",
            rebalancer: data.assignments.rebalancer || "",
            research: data.assignments.research || "",
            moderator: data.assignments.moderator || ""
          });
        }
        if (data.allow_cross_chain_trades !== undefined) {
          setAllowCrossChain(Boolean(data.allow_cross_chain_trades));
        }
        fetchBalancesForWallets(loadedWallets);
      }
    } catch (e) {
      console.warn("Failed to load agent wallet configuration:", e);
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (isOpen && accountId) {
      fetchConfig();
      const interval = setInterval(() => {
        if (wallets.length > 0) {
          fetchBalancesForWallets(wallets);
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, accountId, fetchConfig, wallets.length]);

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleExportKey = async (keyId: number) => {
    if (!accountId) return;
    setIsExportLoading(keyId);
    try {
      const res = await fetch("/api/agent-wallet/export-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_wallet: accountId, key_id: keyId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to export key credentials");
      setExportedKeyData({
        id: data.credentials.id,
        address: data.credentials.agent_wallet_address,
        publicKey: data.credentials.public_key,
        privateKey: data.credentials.private_key,
        chain: data.credentials.chain_type || "near",
        label: data.credentials.label,
        seedPhrase: data.credentials.seed_phrase || null
      });
      setShowPrivateKey(false);
    } catch (err: any) {
      setErrorToast(err?.message || "Failed to export key");
      setTimeout(() => setErrorToast(null), 3500);
    } finally {
      setIsExportLoading(null);
    }
  };

  const handleToggleCrossChain = async (enabled: boolean) => {
    setAllowCrossChain(enabled);
    if (!accountId) return;
    try {
      await fetch("/api/settings/cross-chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          allow_cross_chain: enabled,
        }),
      });
      setSuccessToast(`Cross-chain trading via NEAR Intents ${enabled ? 'enabled' : 'disabled'}.`);
      setTimeout(() => setSuccessToast(null), 2500);
    } catch (e) {
      console.error("Failed to toggle cross-chain:", e);
    }
  };

  // Preview subaccount name
  const computedSubaccountPreview = () => {
    const clean = subaccountPrefix.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "agent";
    if (!accountId) return `${clean}.user.${isMain ? "near" : "testnet"}`;
    if (accountId.endsWith(".testnet") || accountId.endsWith(".near") || accountId.includes(".")) {
      return `${clean}.${accountId}`;
    }
    // If accountId is an implicit 64-char address, subaccount exceeds 64 chars -> NEAR protocol transfer-to-create implicit address
    return `Implicit Hex Address (derived from public key)`;
  };

  // ── ON-CHAIN AGENT WALLET CREATION & FUNDING ──
  const handleCreateAndFundAgentWallet = async () => {
    if (!accountId) {
      onConnectWallet?.();
      return;
    }
    if (wallets.length >= 4) {
      setErrorToast("Maximum 4 agent execution wallets allowed in your pool.");
      setTimeout(() => setErrorToast(null), 3000);
      return;
    }

    // EVM Wallet Generation branch
    if (creationMethod === "evm_wallet") {
      setCreationStep("generating");
      try {
        const res = await fetch("/api/agent-wallet/generate-evm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_wallet: accountId,
            label: evmLabel.trim() || "Trader Arbitrum / EVM Wallet",
            assigned_agent: assignedAgentChoice !== "none" ? assignedAgentChoice : null
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to generate EVM wallet");

        if (data.wallet?.private_key) {
          setExportedKeyData({
            id: data.wallet.id,
            address: data.wallet.agent_wallet_address,
            publicKey: data.wallet.public_key,
            privateKey: data.wallet.private_key,
            chain: "evm",
            label: data.wallet.label
          });
          setShowPrivateKey(false);
        }

        setSuccessToast(`Created EVM / Arbitrum Wallet (${data.wallet.agent_wallet_address.slice(0, 10)}...) for cross-chain trades!`);
        setTimeout(() => setSuccessToast(null), 4000);
        setIsCreating(false);
        await fetchConfig();
      } catch (e: any) {
        setErrorToast(e?.message || "EVM wallet creation error");
        setTimeout(() => setErrorToast(null), 4000);
      } finally {
        setCreationStep("idle");
      }
      return;
    }

    const cleanPrefix = subaccountPrefix.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleanPrefix && creationMethod === "named_subaccount") {
      setErrorToast("Please enter a valid wallet prefix (e.g. trader, rebalancer, alpha)");
      setTimeout(() => setErrorToast(null), 3000);
      return;
    }

    const fundingNearNum = parseFloat(fundingAmountNear) || 0.5;
    if (fundingNearNum < 0.1) {
      setErrorToast("Minimum funding is 0.1 NEAR to cover blockchain storage staking & gas.");
      setTimeout(() => setErrorToast(null), 3500);
      return;
    }

    setErrorToast(null);
    setCreationStep("generating");
    try {
      const label = subaccountLabel.trim() || `${cleanPrefix.toUpperCase()} Execution Wallet`;
      const walletType = creationMethod === "named_subaccount" ? "subaccount" : "implicit";

      // 1. Propose keypair in backend -> generates autonomous keypair & sign payload
      // For 'implicit', payload is pure Transfer to derived implicit address
      const res = await fetch("/api/agent-wallet/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          label,
          wallet_type: walletType,
          subaccount_prefix: cleanPrefix,
          funding_near: fundingNearNum,
          assigned_agent: assignedAgentChoice !== "none" ? assignedAgentChoice : null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to propose agent wallet keypair");

      const createdWallet = data.wallet;
      const signPayload = createdWallet.sign_payload;

      // 2. Request signature from connected main wallet to execute on-chain creation & funding
      setCreationStep("signing");
      let txHash = "";
      if (signPayload) {
        // [WALLET GUARD] Strict validation before sending payload to user wallet
        const receiver = (signPayload.receiverId || (signPayload as any).receiver_id || "").trim().toLowerCase();
        if (creationMethod === "named_subaccount") {
          if (!receiver.endsWith(".testnet") && !receiver.endsWith(".near")) {
            throw new Error(`[Wallet Guard Block] Security Violation: Subaccount address must end with .near or .testnet. Detected: "${receiver}".`);
          }
        } else if (creationMethod === "implicit") {
          const isHex64 = /^[0-9a-f]{64}$/.test(receiver);
          if (!isHex64) {
            throw new Error(`[Wallet Guard Block] Security Violation: Implicit address requires a 64-character hex address. Detected: "${receiver}". Transaction aborted.`);
          }
          if (!Array.isArray(signPayload.actions) || signPayload.actions.some((a: any) => a.type !== "Transfer")) {
            throw new Error(`[Wallet Guard Block] Dangerous action detected: Implicit account transfer must contain ONLY a Transfer action. Aborted.`);
          }
        }
        try {
          const txResult = await signAndSendTransaction(signPayload);
          txHash = txResult?.hash || "";
        } catch (txErr: any) {
          throw new Error(`Wallet signing cancelled or failed: ${txErr?.message || txErr}`);
        }
      }

      // 3. Mark active in backend with tx confirmation and assign to requested agent
      setCreationStep("verifying");
      await fetch("/api/agent-wallet/activate-subaccount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          key_id: createdWallet.id,
          tx_hash: txHash,
          assigned_agent: assignedAgentChoice !== "none" ? assignedAgentChoice : null
        })
      });

      setLastCreatedTxHash(txHash);
      setCreationStep("done");
      if (createdWallet?.private_key) {
        setExportedKeyData({
          id: createdWallet.id,
          address: createdWallet.agent_wallet_address,
          publicKey: createdWallet.public_key,
          privateKey: createdWallet.private_key,
          chain: createdWallet.chain_type || "near",
          label: createdWallet.label,
          seedPhrase: createdWallet.seed_phrase || null
        });
        setShowPrivateKey(false);
      }
      const shortAddr = createdWallet.agent_wallet_address.length > 20
        ? `${createdWallet.agent_wallet_address.slice(0, 8)}...${createdWallet.agent_wallet_address.slice(-6)}`
        : createdWallet.agent_wallet_address;
      setSuccessToast(`Funded & activated ${shortAddr} with ${fundingNearNum} NEAR! FullAccess delegated to agent.`);
      setTimeout(() => setSuccessToast(null), 5000);
      setIsCreating(false);
      setSubaccountPrefix("trader");
      setSubaccountLabel("");
      await fetchConfig();
    } catch (e: any) {
      console.error("[AgentWallet] Creation error:", e);
      setErrorToast(e?.message || "Failed to create & fund agent wallet");
      setTimeout(() => setErrorToast(null), 4500);
      setCreationStep("idle");
    }
  };

  // ── DEPOSIT / TOP UP EXISTING AGENT WALLET ──
  const handleTopupWallet = async () => {
    if (!topupTargetWallet || !accountId) return;
    const amount = parseFloat(topupAmount) || 0.5;
    if (amount <= 0) {
      setErrorToast("Please enter a valid deposit amount");
      return;
    }

    setIsTopupBusy(true);
    setErrorToast(null);
    try {
      // 1. Get transfer payload
      const res = await fetch("/api/agent-wallet/fund-payload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          key_id: topupTargetWallet.id,
          amount_near: amount
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to generate deposit payload");

      // 2. Sign and send transaction from connected main wallet
      // [WALLET GUARD] Verify recipient address before signing deposit
      const receiver = (data.sign_payload?.receiverId || "").trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(receiver) && !receiver.endsWith(".testnet") && !receiver.endsWith(".near")) {
        throw new Error(`[Wallet Guard Block] Security Violation: Invalid recipient address "${receiver}". Aborted.`);
      }
      const txResult = await signAndSendTransaction(data.sign_payload);
      const hash = txResult?.hash || "";

      setSuccessToast(`Deposited ${amount} NEAR into ${topupTargetWallet.label}!`);
      setTimeout(() => setSuccessToast(null), 4000);
      setTopupTargetWallet(null);
      await fetchConfig();
    } catch (e: any) {
      setErrorToast(e?.message || "Failed to deposit funds");
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsTopupBusy(false);
    }
  };

  // ── WITHDRAW FUNDS BACK TO USER WALLET ──
  const handleWithdrawFunds = async (wallet: AgentWallet) => {
    if (!accountId) return;
    setIsWithdrawBusy(true);
    setErrorToast(null);
    try {
      const res = await fetch("/api/agent-wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          key_id: wallet.id,
          amount_near: null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Withdrawal failed");

      setSuccessToast(`Withdrew ${data.transferred_near?.toFixed(4)} NEAR to ${accountId}! TX: ${data.tx_hash?.slice(0, 10)}...`);
      setTimeout(() => setSuccessToast(null), 5000);
      setWithdrawTargetWallet(null);
      await fetchConfig();
    } catch (e: any) {
      setErrorToast(e?.message || "Failed to withdraw funds");
      setTimeout(() => setErrorToast(null), 5000);
    } finally {
      setIsWithdrawBusy(false);
    }
  };

  // ── IMPORT / HAND OVER EXISTING WALLET ──
  const handleImportWallet = async () => {
    if (!accountId) return;
    if (!importSecret.trim()) {
      setErrorToast("Please paste your Private Key or 12-Word Passphrase");
      setTimeout(() => setErrorToast(null), 3000);
      return;
    }

    setIsImporting(true);
    setErrorToast(null);
    try {
      const trimmedSecret = importSecret.trim();
      const isWords = trimmedSecret.split(/\s+/).length >= 12;
      const res = await fetch("/api/agent-wallet/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          agent_account_id: importAccountId.trim(),
          private_key: isWords ? "" : trimmedSecret,
          seed_phrase: isWords ? trimmedSecret : "",
          label: importLabel.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        const errorDetail = typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
          ? data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ")
          : (typeof data.detail === "object" ? JSON.stringify(data.detail) : "Failed to import wallet");
        throw new Error(errorDetail);
      }

      const assignedAddr = data.wallet?.agent_wallet_address || "wallet";
      setSuccessToast(`Connected ${assignedAddr} directly to agent!`);
      setTimeout(() => setSuccessToast(null), 4000);
      setIsImportingView(false);
      setImportAccountId("");
      setImportSecret("");
      setImportLabel("");
      await fetchConfig();
    } catch (e: any) {
      setErrorToast(e?.message || "Import error");
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsImporting(false);
    }
  };

  // ── DELETE WALLET ──
  const handleDeleteWallet = async (keyId: number) => {
    if (!accountId) return;
    if (!confirm("Are you sure you want to delete this agent wallet? Any agents using it will be unassigned.")) return;

    try {
      const res = await fetch("/api/agent-wallet/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_wallet: accountId, key_id: keyId })
      });
      if (res.ok) {
        setSuccessToast("Agent wallet removed.");
        setTimeout(() => setSuccessToast(null), 2500);
        await fetchConfig();
      }
    } catch (e: any) {
      setErrorToast("Failed to delete wallet");
      setTimeout(() => setErrorToast(null), 2500);
    }
  };

  // ── SAVE ASSIGNMENTS ──
  const handleSaveAssignments = async () => {
    if (!accountId) {
      onConnectWallet?.();
      return;
    }

    setIsSaving(true);
    setErrorToast(null);
    try {
      const res = await fetch("/api/agent-wallet/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          assignments
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save assignments");

      setSuccessToast("Agent wallet assignments saved successfully!");
      setTimeout(() => setSuccessToast(null), 3000);
      await fetchConfig();
    } catch (e: any) {
      setErrorToast(e?.message || "Assignment error");
      setTimeout(() => setErrorToast(null), 3500);
    } finally {
      setIsSaving(false);
    }
  };

  const countAssignedAgents = (walletId: string) => {
    return Object.values(assignments).filter((v) => v === walletId).length;
  };

  const agentsList = [
    { id: "trader", name: "Titan Quantitative Trader", role: "Scalping & Swing Trading via NEAR Intents", icon: TrendingUp },
    { id: "rebalancer", name: "Portfolio Rebalancer", role: "Target Allocation & Drift Management", icon: Scale }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in-0">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-card/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Key size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground text-base tracking-tight">Agent Execution Wallets</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/25">
                  Autonomous Agent Key Pool
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fund dedicated autonomous wallets &amp; grant FullAccess to your agents.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 space-y-6">
          {/* Active Network / Connected Wallet Banner */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border text-xs">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isMain ? "bg-cyan-400" : "bg-emerald-400"} animate-pulse`} />
              <span className="text-muted-foreground">Connected Funding Wallet:</span>
              <span className="font-mono font-bold text-foreground">{accountId || "No wallet connected"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                isMain
                  ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                  : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              }`}>
                {isMain ? "NEAR MAINNET" : "NEAR TESTNET"}
              </span>
              <button
                onClick={() => setShowArchitectureGuide(!showArchitectureGuide)}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Info size={12} />
                <span>{showArchitectureGuide ? "Hide Guide" : "How It Works"}</span>
              </button>
            </div>
          </div>

          {/* Architecture & Protocol Guide Card */}
          {showArchitectureGuide && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-xs space-y-3 animate-in fade-in-0">
              <div className="flex items-center gap-2 text-primary font-bold">
                <Sparkles size={14} />
                <span>How NEAR Wallet Creation &amp; Agent Full Access Actually Work</span>
              </div>
              <div className="space-y-2 text-muted-foreground leading-relaxed text-[11px]">
                <p>
                  <strong>1. On-Chain Account Creation:</strong> On NEAR Protocol, accounts do not exist until they are created and funded on-chain by a parent wallet. When you deploy an agent wallet, your connected wallet ({accountId || "connected wallet"}) signs an on-chain transaction that bundles 3 atomic actions:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pl-2">
                  <div className="p-2 rounded-lg bg-background/60 border border-border">
                    <span className="font-mono font-bold text-foreground">1. CreateAccount</span>
                    <p className="text-[10px] mt-0.5">Allocates the subaccount name on the NEAR blockchain state.</p>
                  </div>
                  <div className="p-2 rounded-lg bg-background/60 border border-border">
                    <span className="font-mono font-bold text-foreground">2. Transfer(deposit)</span>
                    <p className="text-[10px] mt-0.5">Funds storage deposit (~0.08 NEAR) + operating balance from your wallet.</p>
                  </div>
                  <div className="p-2 rounded-lg bg-background/60 border border-border">
                    <span className="font-mono font-bold text-foreground">3. AddKey(FullAccess)</span>
                    <p className="text-[10px] mt-0.5">Grants full autonomous signing permission to the Agent keypair.</p>
                  </div>
                </div>
                <p>
                  <strong>2. Autonomous Agent Signing via API:</strong> The agent backend securely holds the matching encrypted private key. When trading or swapping via NEAR Intents, the agent API signs directly with its FullAccess key without needing popup approval on every single trade.
                </p>
                <p>
                  <strong>3. Fund Sandboxing:</strong> The agent can only ever spend the balance deposited into its dedicated account. Your main wallet funds remain completely isolated and secure!
                </p>
              </div>
            </div>
          )}

          {/* Cross-Chain Settings Switch */}
          <div className="p-3.5 rounded-xl bg-secondary/20 border border-border flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles size={13} className="text-primary" />
                Allow Cross-Chain Swaps (NEAR Intents)
              </span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Authorizes autonomous agents to execute cross-chain swaps (ETH, BTC, SOL, ARB) via Defuse 1-Click protocol.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleCrossChain(!allowCrossChain)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                allowCrossChain ? "bg-primary" : "bg-secondary"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  allowCrossChain ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Wallet Pool Section */}
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Your Agent Wallet Pool ({wallets.length} / 4)
                </span>
                <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(wallets.length / 4) * 100}%` }}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsImportingView(!isImportingView);
                    setIsCreating(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    isImportingView
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border hover:bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isImportingView ? "Cancel Import" : "Import Key"}
                </button>

                {!isCreating ? (
                  <button
                    onClick={() => {
                      setIsCreating(true);
                      setIsImportingView(false);
                    }}
                    disabled={wallets.length >= 4}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-all shadow-sm"
                  >
                    <PlusCircle size={13} />
                    <span>+ Create &amp; Fund Agent Wallet</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsCreating(false)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border border-border hover:bg-secondary text-muted-foreground"
                  >
                    Close Setup
                  </button>
                )}
              </div>
            </div>

            {/* ═══ CREATE & FUND AGENT WALLET WIZARD ═══ */}
            {isCreating && (
              <div className="p-4 mb-4 rounded-xl bg-secondary/35 border border-primary/30 space-y-4 animate-in fade-in-0">
                <div className="flex items-center justify-between border-b border-border/50 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center text-primary">
                      <Zap size={14} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">Add Agent Execution Wallet</h4>
                      <p className="text-[10px] text-muted-foreground">Select wallet type: NEAR Autonomous Wallet or Arbitrum/EVM Cross-Chain Wallet.</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/20 text-primary">
                    Autonomous Execution
                  </span>
                </div>

                {/* Creation Method Tabs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCreationMethod("named_subaccount")}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      creationMethod === "named_subaccount"
                        ? "border-primary/50 bg-primary/10 shadow-sm"
                        : "border-border bg-background/50 hover:bg-secondary/40 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Layers size={13} className="text-primary" />
                        Named Subaccount
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-primary/20 text-primary">
                        .{isMain ? "NEAR" : "TESTNET"}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                      Creates <code>&lt;prefix&gt;.{accountId || `user.${isMain ? "near" : "testnet"}`}</code> on-chain.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreationMethod("implicit")}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      creationMethod === "implicit"
                        ? "border-emerald-500/50 bg-emerald-500/10 shadow-sm"
                        : "border-border bg-background/50 hover:bg-secondary/40 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <CheckCircle2 size={13} className="text-emerald-400" />
                        Implicit Account
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">
                        HEX ID
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                      64-character autonomous NEAR account created via direct protocol transfer.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreationMethod("evm_wallet")}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      creationMethod === "evm_wallet"
                        ? "border-blue-500/50 bg-blue-500/10 shadow-sm"
                        : "border-border bg-background/50 hover:bg-secondary/40 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Cpu size={13} className="text-blue-400" />
                        Arbitrum / EVM
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-500/20 text-blue-400">
                        0x WALLET
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                      Dedicated EVM wallet for Trader Agent to receive cross-chain trades on Arbitrum &amp; Ethereum.
                    </p>
                  </button>
                </div>

                {/* EVM Wallet Creation Form */}
                {creationMethod === "evm_wallet" ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">EVM Wallet Label</label>
                      <input
                        type="text"
                        value={evmLabel}
                        onChange={(e) => setEvmLabel(e.target.value)}
                        placeholder="e.g. Trader Arbitrum & ETH Wallet"
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Assign to Agent</label>
                      <select
                        value={assignedAgentChoice}
                        onChange={(e) => setAssignedAgentChoice(e.target.value)}
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary/50"
                      >
                        <option value="trader">Titan Trader Agent (Cross-chain Arbitrum target)</option>
                        <option value="rebalancer">Portfolio Rebalancer Agent</option>
                        <option value="none">Keep in Pool (Unassigned)</option>
                      </select>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/25 text-xs text-blue-300 space-y-1">
                      <p className="font-bold">Multi-Chain Agent Execution Flow:</p>
                      <p className="text-[11px] text-blue-200/80 leading-relaxed">
                        The Trader Agent uses funds from its NEAR execution wallet to execute cross-chain swaps via Defuse 1-Click intents, and the Defuse solver delivers the purchased Arbitrum/ETH tokens directly to this 0x EVM wallet on Arbitrum!
                      </p>
                    </div>
                    <button
                      onClick={handleCreateAndFundAgentWallet}
                      disabled={creationStep !== "idle" && creationStep !== "done"}
                      className="w-full py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 active:scale-98 text-white transition-all shadow-md shadow-blue-500/20"
                    >
                      {creationStep === "generating" ? "Generating EVM Keypair..." : "Generate Arbitrum / EVM Destination Wallet"}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Step 1: Subaccount Prefix / Wallet Identifier */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">
                        {creationMethod === "named_subaccount" ? "Subaccount Prefix" : "Wallet Label / Identifier"}
                      </label>
                      <div className="flex items-center rounded-lg bg-background border border-border px-3 py-1.5 text-xs">
                        <input
                          type="text"
                          value={subaccountPrefix}
                          onChange={(e) => setSubaccountPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                          placeholder={creationMethod === "named_subaccount" ? "Enter custom prefix (e.g. trader, alpha, rebalancer)" : "e.g. trading-pool-1"}
                          className="w-full bg-transparent text-foreground focus:outline-none font-mono"
                        />
                      </div>
                    </div>

                    {/* Step 2: Assign to Agent & Label */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Assign to Agent</label>
                        <select
                          value={assignedAgentChoice}
                          onChange={(e) => setAssignedAgentChoice(e.target.value)}
                          className="w-full mt-1 px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary/50"
                        >
                          <option value="trader">Titan Trader Agent</option>
                          <option value="rebalancer">Portfolio Rebalancer Agent</option>
                          <option value="none">Keep in Pool (Unassigned)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Wallet Label</label>
                        <input
                          type="text"
                          value={subaccountLabel}
                          onChange={(e) => setSubaccountLabel(e.target.value)}
                          placeholder={`e.g. ${subaccountPrefix.toUpperCase()} Execution Key`}
                          className="w-full mt-1 px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary/50"
                        />
                      </div>
                    </div>

                    {/* Step 3: Funding Deposit Amount from Main Wallet */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">
                          Initial Funding from Connected Wallet ({accountId || "main wallet"})
                        </label>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Min: 0.1 NEAR • Recommended: 0.5 NEAR
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {["0.25", "0.5", "1.0", "2.0"].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setFundingAmountNear(amt)}
                            className={`flex-1 py-1 text-xs rounded-lg border font-mono font-bold transition-all ${
                              fundingAmountNear === amt
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-background border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {amt} NEAR
                          </button>
                        ))}
                        <div className="w-24 relative">
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={fundingAmountNear}
                            onChange={(e) => setFundingAmountNear(e.target.value)}
                            placeholder="Custom"
                            className="w-full px-2 py-1 text-xs font-mono bg-background border border-border rounded-lg text-foreground text-center focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Summary Box */}
                    <div className="p-3 rounded-lg bg-background/60 border border-border space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Creation Mechanism:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {creationMethod === "named_subaccount" ? "Named Subaccount (On-Chain)" : "Implicit NEAR Account"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Target Recipient Address:</span>
                        <span className="font-mono font-bold text-foreground text-[10px]">
                          {creationMethod === "named_subaccount" ? computedSubaccountPreview() : "64-Character Implicit Hex Address"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Security Guard:</span>
                        <span className="font-mono font-bold text-emerald-400 text-[10px] flex items-center gap-1">
                          <Shield size={11} />
                          Active (On-Chain Key Isolation)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Debited from Connected Wallet:</span>
                        <span className="font-mono font-bold text-foreground">-{fundingAmountNear} NEAR</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Operating Signing Permission:</span>
                        <span className="font-mono font-bold text-emerald-400">FullAccess delegated to Agent</span>
                      </div>
                    </div>

                    {/* Interactive Submit Button */}
                    <button
                      onClick={handleCreateAndFundAgentWallet}
                      disabled={creationStep !== "idle" && creationStep !== "done"}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95 active:scale-98 text-white transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
                    >
                      {creationStep === "generating" && (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Generating Agent Keypair...</span>
                        </>
                      )}
                      {creationStep === "signing" && (
                        <>
                          <Flame size={13} className="animate-bounce" />
                          <span>Please approve {fundingAmountNear} NEAR in your wallet ({accountId})...</span>
                        </>
                      )}
                      {creationStep === "verifying" && (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Broadcasting &amp; Verifying On-Chain RPC State...</span>
                        </>
                      )}
                      {(creationStep === "idle" || creationStep === "done") && (
                        <>
                          <Zap size={14} />
                          <span>Sign &amp; Fund Agent Wallet ({fundingAmountNear} NEAR)</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Import Form */}
            {isImportingView && (
              <div className="p-4 mb-3 rounded-xl bg-secondary/30 border border-primary/20 space-y-3 animate-in fade-in-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground">Hand Over an Existing Wallet to Agent</h4>
                  <span className="text-[10px] text-muted-foreground">No Subaccount Friction</span>
                </div>
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 leading-relaxed">
                  💡 <strong>How this works:</strong> You can create a normal named account directly inside <strong>Meteor Wallet</strong> (or HERE/Sender), fund it with NEAR, and export its Private Key (<em>Settings ➡️ Security &amp; Recovery ➡️ Export Private Key</em>). Paste it here to delegate it to your agent!
                </div>
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-between">
                      <span>Private Key or 12-Word Passphrase (Required)</span>
                      <span className="text-[9px] text-emerald-400 font-normal">Supports NEAR (ed25519) &amp; EVM (0x...)</span>
                    </label>
                    <input
                      type="text"
                      value={importSecret}
                      onChange={(e) => setImportSecret(e.target.value)}
                      placeholder="e.g. ed25519:... or 0x... or 12-word seed phrase"
                      className="w-full mt-1 px-3 py-2 text-xs font-mono bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">
                        Account ID (Optional — auto-detected)
                      </label>
                      <input
                        type="text"
                        value={importAccountId}
                        onChange={(e) => setImportAccountId(e.target.value)}
                        placeholder="Auto-detected from key if empty"
                        className="w-full mt-1 px-3 py-1.5 text-xs font-mono bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Label (Optional)</label>
                      <input
                        type="text"
                        value={importLabel}
                        onChange={(e) => setImportLabel(e.target.value)}
                        placeholder="Optional (defaults to account name)"
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground">Public key will be derived automatically from the private key.</span>
                  <button
                    onClick={handleImportWallet}
                    disabled={isImporting}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                  >
                    {isImporting ? "Importing & Verifying..." : "Confirm Hand Over"}
                  </button>
                </div>
              </div>
            )}

            {/* Wallets List */}
            {wallets.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-border bg-secondary/20 text-center">
                <Cpu size={24} className="mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-xs font-medium text-foreground">No agent execution wallets created yet.</p>
                <p className="text-[11px] text-muted-foreground/70 mt-1 max-w-md mx-auto">
                  Click <strong>&quot;+ Create &amp; Fund Agent Wallet&quot;</strong> to deploy an on-chain subaccount funded by your main wallet with delegated FullAccess.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {wallets.map((w) => {
                  const shareCount = countAssignedAgents(String(w.id));
                  const isSubaccount = w.agent_wallet_address.includes(".");
                  const balInfo = balances[w.agent_wallet_address] || { formatted: "Checking...", exists: true };
                  const numNear = parseFloat(balInfo.formatted) || 0;
                  const isZeroOrUnfunded = balInfo.exists === false || (balInfo.formatted !== "Checking..." && numNear <= 0);

                  return (
                    <div
                      key={w.id}
                      className={`p-3.5 rounded-xl border transition-all space-y-2 relative group ${
                        isZeroOrUnfunded
                          ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50"
                          : "border-border bg-secondary/30 hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isZeroOrUnfunded ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
                          <span className="text-xs font-bold text-foreground">{w.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {balInfo.exists === false && (
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30"
                              title="This account was never registered on-chain because the creation transaction was blocked by Meteor or cancelled."
                            >
                              NOT ON-CHAIN
                            </span>
                          )}
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                            isSubaccount
                              ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                              : "bg-blue-500/15 text-blue-400 border-blue-500/30"
                          }`}>
                            {isSubaccount ? "NAMED SUBACCOUNT" : "IMPLICIT"}
                          </span>
                          <button
                            onClick={() => handleDeleteWallet(w.id)}
                            className="p-1 rounded text-muted-foreground hover:text-red-400 opacity-60 hover:opacity-100 transition-colors"
                            title="Delete Wallet"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Address & Public Key */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                          <span className="truncate max-w-[200px]" title={w.agent_wallet_address}>
                            {w.agent_wallet_address.length > 24
                              ? `${w.agent_wallet_address.slice(0, 12)}...${w.agent_wallet_address.slice(-8)}`
                              : w.agent_wallet_address
                            }
                          </span>
                          <button
                            onClick={() => handleCopy(w.agent_wallet_address, `addr-${w.id}`)}
                            className="p-1 hover:text-foreground text-muted-foreground transition-colors"
                            title="Copy Address"
                          >
                            {copiedKey === `addr-${w.id}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground/60">
                          <span className="truncate max-w-[200px]" title={w.public_key}>
                            {w.public_key.slice(0, 16)}...
                          </span>
                          <button
                            onClick={() => handleCopy(w.public_key, `pk-${w.id}`)}
                            className="p-1 hover:text-foreground transition-colors"
                            title="Copy Public Key"
                          >
                            {copiedKey === `pk-${w.id}` ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                          </button>
                        </div>
                      </div>

                      {/* Live On-Chain Balance & Top Up Action */}
                      <div className="p-2 rounded-lg bg-background/50 border border-border/60 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Wallet size={12} className={numNear > 0 ? "text-emerald-400" : "text-muted-foreground"} />
                          <span className={`text-[11px] font-mono font-bold ${numNear > 0 ? "text-emerald-400" : "text-foreground"}`}>
                            {balInfo.formatted}
                          </span>
                          {numNear > 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              ACTIVE
                            </span>
                          )}
                          <button
                            onClick={() => fetchBalancesForWallets([w])}
                            className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            title="Refresh On-Chain Balance"
                          >
                            <RefreshCw size={10} />
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleExportKey(w.id)}
                            disabled={isExportLoading === w.id}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-all"
                            title="Export & Copy Private Key Credentials"
                          >
                            {isExportLoading === w.id ? (
                              <RefreshCw size={10} className="animate-spin" />
                            ) : (
                              <Key size={10} />
                            )}
                            <span>Export Key</span>
                          </button>

                          {numNear > 0 && w.chain_type === "near" && (
                            <button
                              onClick={() => {
                                setWithdrawTargetWallet(w);
                                setTopupTargetWallet(null);
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all"
                              title="Withdraw funds back to your primary wallet"
                            >
                              <ArrowUpRight size={10} />
                              <span>Withdraw</span>
                            </button>
                          )}

                          <button
                            onClick={() => setTopupTargetWallet(w)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-all"
                          >
                            <PlusCircle size={10} />
                            <span>Deposit Funds</span>
                          </button>
                        </div>
                      </div>

                      {/* Status / Assigned Agents Tag */}
                      <div className="pt-1 flex items-center justify-between gap-1.5 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          {shareCount === 0 ? (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground font-medium">
                              Unassigned
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary border border-primary/25 font-bold">
                              Assigned to {shareCount} {shareCount === 1 ? "Agent" : "Agents"}
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] font-bold text-muted-foreground/80 font-mono">
                          FullAccess Key
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Key Export & Backup Popover Dialog */}
          {exportedKeyData && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 via-background to-secondary/40 border border-amber-500/40 space-y-3 animate-in fade-in-0 shadow-lg shadow-amber-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                    <Key size={15} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                      Agent Account Credentials & Backup
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono">
                        {exportedKeyData.chain}
                      </span>
                    </h4>
                    <p className="text-[10px] text-muted-foreground">
                      Wallet ID #{exportedKeyData.id} • {exportedKeyData.label || "Delegated Agent Wallet"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setExportedKeyData(null)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Explainer / Guardrail note */}
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10.5px] text-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Shield size={12} className="text-amber-400" />
                  <span>Important Custody & Agent Security Notice</span>
                </div>
                <p className="text-muted-foreground text-[10px] leading-relaxed">
                  You can copy and import these credentials into your NEAR wallet, NEAR CLI, or MetaMask to take direct manual custody of the account.
                  <strong className="text-foreground"> The AI Agent fleet never has direct access to this private key.</strong> The agent only invokes guarded backend transaction-signing functions bound strictly to your primary wallet ({accountId}).
                </p>
              </div>

              {/* On-Chain Existence Warning if Unregistered */}
              {balances[exportedKeyData.address]?.exists === false && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-1">
                  <div className="text-[11px] font-bold flex items-center gap-1.5">
                    <AlertCircle size={13} className="text-amber-400 shrink-0" />
                    <span>Account Does Not Exist On-Chain</span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-amber-200/80">
                    <strong>{exportedKeyData.address}</strong> was never created on the NEAR blockchain because the transaction was blocked by Meteor or cancelled. External wallets will report <em>&quot;Cannot find account associated with key&quot;</em> because the account was never deployed on-chain. Zero funds exist in this account.
                  </p>
                </div>
              )}

              {/* Credential Fields */}
              <div className="space-y-2 pt-1 font-mono">
                {/* Account Address */}
                <div className="p-2 rounded-lg bg-background/80 border border-border/70 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-sans font-semibold">Agent Account Address / ID</div>
                    <div className="text-[11px] text-foreground truncate">{exportedKeyData.address}</div>
                  </div>
                  <button
                    onClick={() => handleCopy(exportedKeyData.address, "export-addr")}
                    className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all shrink-0"
                    title="Copy Address"
                  >
                    {copiedKey === "export-addr" ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                </div>

                {/* Public Key */}
                <div className="p-2 rounded-lg bg-background/80 border border-border/70 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-sans font-semibold">Public Key</div>
                    <div className="text-[11px] text-foreground truncate">{exportedKeyData.publicKey}</div>
                  </div>
                  <button
                    onClick={() => handleCopy(exportedKeyData.publicKey, "export-pub")}
                    className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all shrink-0"
                    title="Copy Public Key"
                  >
                    {copiedKey === "export-pub" ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                </div>

                {/* 12-Word Pass Phrase (Mnemonic) */}
                {exportedKeyData.seedPhrase && (
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-sans font-bold flex items-center gap-1.5">
                        <Key size={12} className="text-emerald-400" />
                        <span>12-Word Secret Pass Phrase (Mnemonic)</span>
                      </div>
                      <button
                        onClick={() => handleCopy(exportedKeyData.seedPhrase!, "export-phrase")}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-semibold transition-all"
                        title="Copy 12-Word Pass Phrase"
                      >
                        {copiedKey === "export-phrase" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        <span>{copiedKey === "export-phrase" ? "Copied" : "Copy Pass Phrase"}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 pt-1">
                      {exportedKeyData.seedPhrase.split(" ").map((word, idx) => (
                        <div key={idx} className="bg-black/50 border border-emerald-500/25 rounded px-2 py-1 text-center font-mono text-[11px] text-emerald-200">
                          <span className="text-[9px] text-emerald-500/60 mr-1 select-none">{idx + 1}.</span>
                          <span className="font-semibold">{word}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] text-emerald-300/80 pt-1 leading-tight">
                      ✨ <strong>Universal Wallet Compatibility:</strong> You can import this exact 12-word pass phrase into <strong>Meteor Wallet</strong>, <strong>HERE Wallet</strong>, <strong>Sender</strong>, or <strong>Nightly</strong> via <em>&quot;Import Passphrase / Seed Phrase&quot;</em>.
                    </div>
                  </div>
                )}

                {/* Private Key (Standard) */}
                <div className="p-2 rounded-lg bg-background/80 border border-amber-500/30 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] text-amber-400 uppercase tracking-wider font-sans font-semibold flex items-center gap-1">
                      <Lock size={10} />
                      <span>Private Key (Standard NEAR Format)</span>
                    </div>
                    <div className="text-[11px] text-foreground break-all">
                      {showPrivateKey
                        ? exportedKeyData.privateKey
                        : "•".repeat(Math.min(exportedKeyData.privateKey.length, 48))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
                      title={showPrivateKey ? "Hide Private Key" : "Show Private Key"}
                    >
                      {showPrivateKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      onClick={() => handleCopy(exportedKeyData.privateKey, "export-priv")}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
                      title="Copy Standard Private Key"
                    >
                      {copiedKey === "export-priv" ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>

                {/* Raw Base58 Secret (Without ed25519: prefix) */}
                {exportedKeyData.privateKey.startsWith("ed25519:") && (
                  <div className="p-2 rounded-lg bg-background/80 border border-border/70 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-sans font-semibold flex items-center gap-1">
                        <Key size={10} />
                        <span>Raw Base58 Key (Without ed25519: Prefix)</span>
                      </div>
                      <div className="text-[11px] text-foreground break-all">
                        {showPrivateKey
                          ? exportedKeyData.privateKey.replace("ed25519:", "")
                          : "•".repeat(Math.min(exportedKeyData.privateKey.length - 8, 48))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopy(exportedKeyData.privateKey.replace("ed25519:", ""), "export-raw-priv")}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all shrink-0"
                      title="Copy Raw Base58 Key"
                    >
                      {copiedKey === "export-raw-priv" ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                )}

                <div className="p-2 rounded-lg bg-secondary/30 text-[10px] text-muted-foreground leading-relaxed">
                  💡 <strong>Wallet Import Guide:</strong> Make sure your wallet network is set to <strong>{isMain ? "Mainnet" : "Testnet"}</strong>. If your wallet flags <code>ed25519:</code> as invalid format, paste the <strong>Raw Base58 Key</strong> above. For wallets like <strong>Nightly</strong> or <strong>NEAR Mobile</strong>, select <em>&quot;Import Private Key&quot;</em> directly.
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const block = `NEPTUNE AGENT WALLET CREDENTIALS\n` +
                        `Primary User Wallet: ${accountId}\n` +
                        `Agent Account ID: ${exportedKeyData.address}\n` +
                        `Chain: ${exportedKeyData.chain}\n` +
                        (exportedKeyData.seedPhrase ? `12-Word Pass Phrase: ${exportedKeyData.seedPhrase}\n` : "") +
                        `Public Key: ${exportedKeyData.publicKey}\n` +
                        `Private Key: ${exportedKeyData.privateKey}\n`;
                      handleCopy(block, "copy-all-creds");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-all"
                  >
                    {copiedKey === "copy-all-creds" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    <span>{copiedKey === "copy-all-creds" ? "Copied!" : "Copy All Credentials"}</span>
                  </button>

                  {exportedKeyData.chain === "near" && (
                    <a
                      href={`https://${isMain ? "app" : "testnet"}.mynearwallet.com/recover-account?account_id=${exportedKeyData.address}&private_key=${encodeURIComponent(exportedKeyData.privateKey)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 transition-all shadow-sm"
                    >
                      <ExternalLink size={12} />
                      <span>Open in MyNearWallet</span>
                    </a>
                  )}
                </div>

                <button
                  onClick={() => setExportedKeyData(null)}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-sm"
                >
                  I Have Saved My Credentials
                </button>
              </div>
            </div>
          )}

          {/* Top-up Modal Inline Popover */}
          {topupTargetWallet && (
            <div className="p-4 rounded-xl bg-secondary/40 border border-primary/30 space-y-3 animate-in fade-in-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet size={14} className="text-primary" />
                  <span className="text-xs font-bold text-foreground">
                    Top Up Agent Wallet: {topupTargetWallet.label}
                  </span>
                </div>
                <button
                  onClick={() => setTopupTargetWallet(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Transfer additional {isMain ? "mainnet" : "testnet"} NEAR from your connected wallet ({accountId}) to {topupTargetWallet.agent_wallet_address}.
              </p>

              <div className="flex items-center gap-2">
                {["0.25", "0.5", "1.0", "2.0"].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setTopupAmount(amt)}
                    className={`flex-1 py-1 text-xs rounded-lg border font-mono font-bold transition-all ${
                      topupAmount === amt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    +{amt} NEAR
                  </button>
                ))}
                <div className="w-24">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    placeholder="Custom"
                    className="w-full px-2 py-1 text-xs font-mono bg-background border border-border rounded-lg text-foreground text-center focus:outline-none"
                  />
                </div>
              </div>

              <button
                onClick={handleTopupWallet}
                disabled={isTopupBusy}
                className="w-full py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isTopupBusy ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    <span>Signing On-Chain Transfer...</span>
                  </>
                ) : (
                  <>
                    <ArrowUpRight size={13} />
                    <span>Transfer +{topupAmount} NEAR into Agent Wallet</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Withdraw Funds Inline Popover */}
          {withdrawTargetWallet && (
            <div className="p-4 rounded-xl bg-secondary/40 border border-emerald-500/30 space-y-3 animate-in fade-in-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpRight size={14} className="text-emerald-400" />
                  <span className="text-xs font-bold text-foreground">
                    Withdraw Funds: {withdrawTargetWallet.label}
                  </span>
                </div>
                <button
                  onClick={() => setWithdrawTargetWallet(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Withdraw all available NEAR from this agent wallet back to your connected wallet (<code className="text-foreground font-bold">{accountId}</code>).
              </p>

              <button
                onClick={() => handleWithdrawFunds(withdrawTargetWallet)}
                disabled={isWithdrawBusy}
                className="w-full py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {isWithdrawBusy ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    <span>Signing On-Chain Withdrawal...</span>
                  </>
                ) : (
                  <>
                    <ArrowUpRight size={13} />
                    <span>Withdraw Funds Back to {accountId}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Agent-to-Wallet Assignment Section */}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Multi-Chain Agent Wallet Assignment Matrix
                </span>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  An agent can connect to <strong>1 NEAR wallet</strong> (funding source) + <strong>1 EVM/Arbitrum wallet</strong> (cross-chain destination). Cannot connect 2 wallets on the same chain.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {agentsList.map((agent) => {
                const assignedRaw = String(assignments[agent.id as keyof AgentAssignments] || "");
                const assignedIds = assignedRaw.split(",").map((s) => s.trim()).filter(Boolean);

                const nearWallets = wallets.filter((w) => (w.chain_type || "near").toLowerCase() === "near");
                const evmWallets = wallets.filter((w) => (w.chain_type || "").toLowerCase() === "evm");

                const currentNearId = assignedIds.find((id) => nearWallets.some((w) => String(w.id) === id)) || "";
                const currentEvmId = assignedIds.find((id) => evmWallets.some((w) => String(w.id) === id)) || "";

                const updateAgentChainWallet = (chainType: "near" | "evm", newId: string) => {
                  let updatedList: string[] = [];
                  if (chainType === "near") {
                    if (newId) updatedList.push(newId);
                    if (currentEvmId) updatedList.push(currentEvmId);
                  } else {
                    if (currentNearId) updatedList.push(currentNearId);
                    if (newId) updatedList.push(newId);
                  }
                  setAssignments((prev) => ({
                    ...prev,
                    [agent.id]: updatedList.join(",")
                  }));
                };

                return (
                  <div
                    key={agent.id}
                    className="p-3.5 rounded-xl border border-border bg-secondary/20 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AgentAvatar agentId={agent.id} size={32} />
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-foreground truncate">{agent.name}</h5>
                          <p className="text-[10px] text-muted-foreground truncate">{agent.role}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {currentNearId && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/15 text-primary border border-primary/25">
                            NEAR Connected
                          </span>
                        )}
                        {currentEvmId && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/25">
                            EVM/ARB Connected
                          </span>
                        )}
                        {!currentNearId && !currentEvmId && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-secondary text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dual Chain Wallet Selectors */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                      {/* NEAR Wallet Selector */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          NEAR Execution Wallet (Source Funds)
                        </label>
                        <select
                          value={currentNearId}
                          onChange={(e) => updateAgentChainWallet("near", e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg text-xs font-medium bg-background border border-border text-foreground focus:outline-none focus:border-primary/50"
                        >
                          <option value="">No NEAR Wallet Assigned</option>
                          {nearWallets.map((w) => (
                            <option key={w.id} value={String(w.id)}>
                              {w.label} ({w.agent_wallet_address.length > 16 ? `${w.agent_wallet_address.slice(0, 8)}...${w.agent_wallet_address.slice(-6)}` : w.agent_wallet_address})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* EVM / Arbitrum Wallet Selector */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-blue-400 uppercase flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          Arbitrum / EVM Target (Cross-Chain Recipient)
                        </label>
                        <select
                          value={currentEvmId}
                          onChange={(e) => updateAgentChainWallet("evm", e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg text-xs font-medium bg-background border border-border text-foreground focus:outline-none focus:border-blue-500/50"
                        >
                          <option value="">No EVM Wallet (Cross-chain to ARB disabled)</option>
                          {evmWallets.map((w) => (
                            <option key={w.id} value={String(w.id)}>
                              {w.label} ({w.agent_wallet_address.slice(0, 10)}...{w.agent_wallet_address.slice(-6)})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex items-center justify-between bg-card">
          <div className="text-xs text-muted-foreground">
            {successToast && (
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5 animate-in fade-in-0">
                <CheckCircle2 size={14} />
                {successToast}
              </span>
            )}
            {errorToast && (
              <span className="text-red-400 font-semibold flex items-center gap-1.5 animate-in fade-in-0">
                <AlertCircle size={14} />
                {errorToast}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-foreground transition-all"
            >
              Close
            </button>
            <button
              onClick={handleSaveAssignments}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-primary/20"
            >
              {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              <span>Save Assignments</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
