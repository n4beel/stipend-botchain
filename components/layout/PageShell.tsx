"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";

export interface NavRoute {
  path: string;
  title: string;
}

export interface PageShellProps {
  children: React.ReactNode;
  navItems?: NavRoute[];
  title?: string;
  description?: string;
}

const DEFAULT_ROUTES: NavRoute[] = [
  { path: "/", title: "My Allowances" },
  { path: "/new", title: "+ Create Pot" },
];

/**
 * Archetype S · Gauge Canvas Shell.
 *
 * Plum base (#3B1646) and mint accents (#7DF0C0).
 * Features an organic household header with droplet wordmark and calm status rhythm.
 */
export default function PageShell({
  children,
  navItems = DEFAULT_ROUTES,
  title,
  description,
}: PageShellProps) {
  const currentPath = usePathname();

  return (
    <div className="gauge-canvas flex min-h-screen flex-col text-[#F6E9FA]">
      {/* Top Bar Anchor */}
      <header className="border-b border-[#62306F]/70 bg-[#4A1D58]/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          {/* Logo & Headline */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 no-underline">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#62306F]/50 ring-1 ring-[#7DF0C0]/40">
                <span className="h-3 w-3 rounded-full bg-[#7DF0C0] shadow-[0_0_10px_#7DF0C0]" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-extrabold tracking-tight text-[#F6E9FA]">
                  {app.name}
                </span>
                <span className="text-[11px] text-[#C9A8D6] hidden sm:block">
                  Refilling Spending Pots
                </span>
              </div>
            </Link>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-3">
            <nav className="flex items-center rounded-xl bg-[#2D0D36]/80 p-1 border border-[#62306F]/60">
              {navItems.map((item) => {
                const isCurrent = currentPath === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold no-underline transition-all ${
                      isCurrent
                        ? "bg-[#62306F] text-[#7DF0C0] shadow-sm"
                        : "text-[#C9A8D6] hover:text-[#F6E9FA]"
                    }`}
                  >
                    {item.title}
                  </Link>
                );
              })}
            </nav>

            <NetworkBadge />

            <div className="w-36 shrink-0 sm:w-40">
              <ConnectButton />
            </div>
          </div>
        </div>

        {/* Page Context Headline */}
        {(title || description) && (
          <div className="mx-auto max-w-5xl px-4 pt-5 pb-3 sm:px-6">
            {title && (
              <h1 className="text-2xl font-bold tracking-tight text-[#F6E9FA] sm:text-3xl">
                {title}
              </h1>
            )}
            {description && (
              <p className="mt-1 max-w-2xl text-xs sm:text-sm text-[#C9A8D6] leading-relaxed">
                {description}
              </p>
            )}
          </div>
        )}
      </header>

      {/* Main Flow Container */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        {children}
      </main>

      {/* Footnote Bar */}
      <footer className="border-t border-[#62306F]/50 bg-[#2D0D36]/30 py-4 text-xs text-[#C9A8D6]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7DF0C0]" />
            <span>
              The guardian can close a stipend at any moment. Unused allowance does not roll over.
            </span>
          </div>
          <BuiltOnBotChain />
        </div>
      </footer>
    </div>
  );
}
