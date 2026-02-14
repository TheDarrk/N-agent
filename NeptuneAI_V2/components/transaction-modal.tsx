"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  X,
  Loader2,
} from "lucide-react";

export type TxStep =
  | "preparing"
  | "signing"
  | "broadcasting"
  | "confirmed"
  | "error";

type Props = {
  open: boolean;
  step: TxStep;
  txHash?: string;
  errorMessage?: string;
  payload?: Record<string, unknown>;
  onClose: () => void;
  onRetry?: () => void;
};

const STEPS_CONFIG: {
  id: TxStep;
  label: string;
}[] = [
  { id: "preparing", label: "Preparing transaction" },
  { id: "signing", label: "Waiting for signature" },
  { id: "broadcasting", label: "Broadcasting to network" },
  { id: "confirmed", label: "Transaction confirmed" },
];

function stepIndex(step: TxStep): number {
  if (step === "error") return -1;
  return STEPS_CONFIG.findIndex((s) => s.id === step);
}

export default function TransactionModal({
  open,
  step,
  txHash,
  errorMessage,
  payload,
  onClose,
  onRetry,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  if (!open) return null;

  const currentIdx = stepIndex(step);
  const isError = step === "error";
  const isDone = step === "confirmed";
  const canClose = isDone || isError;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-all duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={canClose ? onClose : undefined}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-sm rounded-2xl border border-[hsl(225,18%,14%)] bg-card shadow-2xl shadow-primary/5 transition-all duration-300 ${visible ? "scale-100 translate-y-0" : "scale-95 translate-y-4"}`}
      >
        {/* Close button (only when done/error) */}
        {canClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        )}

        <div className="p-6">
          {/* Header icon */}
          <div className="flex justify-center mb-5">
            {isError ? (
              <div className="w-16 h-16 rounded-full bg-destructive/10 border-2 border-destructive/20 flex items-center justify-center">
                <XCircle size={28} className="text-destructive" />
              </div>
            ) : isDone ? (
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/20 flex items-center justify-center tx-success-pulse tx-heartbeat">
                <CheckCircle2 size={28} className="text-emerald-400" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                <img
                  src="/neptune-logo.png"
                  alt="Neptune AI"
                  width={40}
                  height={40}
                  className="tx-spinner"
                />
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="text-center text-base font-bold text-foreground mb-1">
            {isError
              ? "Transaction Failed"
              : isDone
                ? "Swap Completed"
                : "Processing Swap"}
          </h3>
          <p className="text-center text-xs text-muted-foreground mb-6">
            {isError
              ? errorMessage || "Something went wrong. Please try again."
              : isDone
                ? "Your tokens have been swapped successfully."
                : "Please do not close this window."}
          </p>

          {/* Token amounts (if payload available) */}
          {payload && (payload.amount || payload.est_out) && (
            <div className="flex items-center justify-center gap-3 mb-6 px-3">
              <div className="text-center">
                <p className="font-mono text-lg font-bold text-foreground">
                  {String(payload.amount || "")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {String(payload.in || payload.token_in || "")}
                </p>
              </div>
              <div className="text-muted-foreground text-xs px-2">{"-->"}</div>
              <div className="text-center">
                <p className="font-mono text-lg font-bold text-emerald-400">
                  {String(payload.est_out || "")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {String(payload.out || payload.token_out || "")}
                </p>
              </div>
            </div>
          )}

          {/* Step progress */}
          {!isError && (
            <div className="space-y-0 mb-4">
              {STEPS_CONFIG.map((s, idx) => {
                const isCurrent = idx === currentIdx;
                const isCompleted = idx < currentIdx || isDone;
                const isPending = idx > currentIdx && !isDone;

                return (
                  <div key={s.id} className="flex items-center gap-3 py-2">
                    {/* Step indicator */}
                    <div className="flex-shrink-0">
                      {isCompleted ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                          <CheckCircle2 size={14} className="text-emerald-400" />
                        </div>
                      ) : isCurrent ? (
                        <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center">
                          <Loader2
                            size={14}
                            className="text-primary animate-spin"
                          />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                        </div>
                      )}
                    </div>

                    {/* Step label */}
                    <span
                      className={`text-[13px] ${
                        isCompleted
                          ? "text-emerald-400 font-medium"
                          : isCurrent
                            ? "text-foreground font-medium"
                            : isPending
                              ? "text-muted-foreground/40"
                              : "text-muted-foreground"
                      }`}
                    >
                      {s.label}
                      {isCurrent && !isDone && (
                        <span className="inline-flex ml-1 gap-[2px]">
                          <span
                            className="thinking-dot w-[3px] h-[3px] rounded-full bg-current inline-block"
                            style={{ animationDelay: "0s" }}
                          />
                          <span
                            className="thinking-dot w-[3px] h-[3px] rounded-full bg-current inline-block"
                            style={{ animationDelay: "0.2s" }}
                          />
                          <span
                            className="thinking-dot w-[3px] h-[3px] rounded-full bg-current inline-block"
                            style={{ animationDelay: "0.4s" }}
                          />
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Error details */}
          {isError && errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/5 border border-destructive/15">
              <p className="text-[12px] text-destructive/80 font-mono leading-relaxed break-all">
                {errorMessage}
              </p>
            </div>
          )}

          {/* TX hash link */}
          {txHash && (
            <a
              href={`https://nearblocks.io/txns/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-[12px] text-primary hover:text-primary/80 transition-colors mb-4 font-mono"
            >
              <span className="truncate max-w-[200px]">{txHash}</span>
              <ExternalLink size={11} className="flex-shrink-0" />
            </a>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {isError && onRetry && (
              <button
                onClick={onRetry}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-all active:scale-[0.98]"
              >
                Try Again
              </button>
            )}
            {canClose && (
              <button
                onClick={onClose}
                className={`${isError && onRetry ? "flex-1" : "w-full"} py-2.5 rounded-xl border border-[hsl(225,18%,14%)] text-[13px] font-medium text-foreground hover:bg-secondary transition-all active:scale-[0.98]`}
              >
                {isDone ? "Done" : "Close"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
