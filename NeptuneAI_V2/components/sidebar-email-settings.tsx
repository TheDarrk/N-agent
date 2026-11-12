"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, Check, Loader2, Send, AlertCircle } from "lucide-react";

type Props = {
  accountId: string | null;
};

export default function SidebarEmailSettings({ accountId }: Props) {
  const [email, setEmail] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch current user settings when accountId changes
  const loadSettings = useCallback(async () => {
    if (!accountId) {
      setEmail("");
      setInputVal("");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/settings/${encodeURIComponent(accountId)}`);
      if (res.ok) {
        const data = await res.json();
        const savedEmail = data?.notification_email || "";
        setEmail(savedEmail);
        setInputVal(savedEmail);
      }
    } catch (err) {
      console.warn("[SidebarEmailSettings] Failed to fetch settings:", err);
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const showMessage = (type: "success" | "error", text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!accountId) return;

    const trimmed = inputVal.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      showMessage("error", "Please enter a valid email address.");
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: accountId,
          notification_email: trimmed,
        }),
      });

      if (!res.ok) throw new Error("Failed to save email settings");
      setEmail(trimmed);
      setInputVal(trimmed);
      showMessage("success", trimmed ? "Alert email saved!" : "Alert email removed.");
    } catch (err) {
      console.error("[SidebarEmailSettings] Error saving email:", err);
      showMessage("error", "Failed to update email. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!accountId) return;
    const targetEmail = inputVal.trim() || email.trim();
    if (!targetEmail) {
      showMessage("error", "Configure an email before sending a test.");
      return;
    }

    setIsTesting(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: accountId,
          notification_email: targetEmail,
        }),
      });

      const data = await res.json();
      if (res.ok && data?.status === "sent") {
        setEmail(targetEmail);
        setInputVal(targetEmail);
        showMessage("success", `Test alert sent to ${targetEmail}!`);
      } else {
        throw new Error(data?.message || "Failed to dispatch test email");
      }
    } catch (err: any) {
      console.error("[SidebarEmailSettings] Test email error:", err);
      showMessage("error", err?.message || "Test dispatch failed.");
    } finally {
      setIsTesting(false);
    }
  };

  const hasChanges = inputVal.trim() !== email.trim();
  const isConfigured = Boolean(email && email.trim());

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Email Alerts
        </h3>
        {accountId && (
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              isConfigured
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {isConfigured ? (
              <>
                <Check size={10} className="stroke-[3]" /> Active
              </>
            ) : (
              "Not set"
            )}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card/50 p-3 text-left transition-colors hover:border-border/80">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 mt-0.5">
            <Mail size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground leading-tight">
              Agent Alert Reports
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Instant trade alerts, limit order fills, and watchdog audits.
            </p>
          </div>
        </div>

        {!accountId ? (
          <div className="mt-3 rounded-lg border border-dashed border-border/80 bg-secondary/30 px-3 py-2 text-center text-xs text-muted-foreground">
            Connect wallet to configure alerts
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-3 flex flex-col gap-2">
            <div className="relative flex items-center">
              <input
                type="email"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="name@example.com"
                disabled={isLoading || isSaving || isTesting}
                className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-50"
              />
              {isLoading && (
                <div className="absolute right-2.5 flex items-center">
                  <Loader2 size={12} className="animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {statusMessage && (
              <div
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${
                  statusMessage.type === "success"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-destructive/10 text-destructive border border-destructive/20"
                }`}
              >
                {statusMessage.type === "success" ? (
                  <Check size={12} className="shrink-0" />
                ) : (
                  <AlertCircle size={12} className="shrink-0" />
                )}
                <span className="truncate">{statusMessage.text}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                type="submit"
                disabled={isSaving || isTesting || (!hasChanges && isConfigured)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  hasChanges
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-40"
                }`}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Check size={12} /> {hasChanges ? "Save Email" : "Saved"}
                  </>
                )}
              </button>

              {isConfigured && (
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={isSaving || isTesting}
                  title="Send test alert email to verify setup"
                  className="flex items-center justify-center gap-1 rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-cyan-500/30 hover:bg-secondary disabled:opacity-40"
                >
                  {isTesting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Send size={12} className="text-cyan-400" />
                  )}
                  <span>Test</span>
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
