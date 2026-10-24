"use client";

import * as RadixToast from "@radix-ui/react-toast";
import { createContext, useContext, useState, useCallback } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (type: ToastType, title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const typeStyles: Record<ToastType, { border: string; dot: string }> = {
  success: { border: "border-[var(--success)]", dot: "bg-[var(--success)]" },
  error:   { border: "border-[var(--danger)]",  dot: "bg-[var(--danger)]" },
  warning: { border: "border-[var(--warning)]", dot: "bg-[var(--warning)]" },
  info:    { border: "border-[var(--accent)]",  dot: "bg-[var(--accent)]" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((type: ToastType, title: string, description?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, title, description }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {toasts.map((t) => (
          <RadixToast.Root
            key={t.id}
            open
            onOpenChange={(open) => {
              if (!open) setToasts((prev) => prev.filter((i) => i.id !== t.id));
            }}
            className={[
              "bg-[var(--bg-elevated)] border-l-2 border-t border-r border-b border-[var(--border-subtle)]",
              typeStyles[t.type].border,
              "p-4 rounded-[2px] flex items-start gap-3 shadow-lg",
              "data-[state=open]:animate-[slideIn_160ms_ease-out]",
              "data-[swipe=end]:animate-[swipeOut_100ms_ease-out]",
            ].join(" ")}
          >
            <div className={["mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0", typeStyles[t.type].dot].join(" ")} />
            <div className="flex flex-col gap-0.5">
              <RadixToast.Title className="text-sm font-medium text-[var(--text-primary)]">
                {t.title}
              </RadixToast.Title>
              {t.description && (
                <RadixToast.Description className="text-[12px] text-[var(--text-secondary)]">
                  {t.description}
                </RadixToast.Description>
              )}
            </div>
            <RadixToast.Close className="ml-auto text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-sm">
              ×
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        {/* Full width minus a gutter on a phone; a fixed column once there is room. w-80 alone
            overflows a 320px screen and drags the page sideways. */}
        <RadixToast.Viewport className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 flex flex-col gap-2 sm:w-80 z-50" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
