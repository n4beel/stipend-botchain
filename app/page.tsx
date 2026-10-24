import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import Panel from "@/components/ui/Panel";
import { app } from "@/lib/app-config";

/**
 * Scaffold home page. Replace the body; keep the shape.
 *
 * The shape is the point: read-only content sits outside `BotChainGate`, and only the part that
 * actually transacts sits inside it. A visitor with no wallet should still see what the app is.
 */
export default function Home() {
  return (
    <PageShell title={app.name} description={app.tagline}>
      <div className="flex flex-col gap-4">
        <Panel>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            This is the template scaffold. Rewrite <code>lib/app-config.ts</code>,{" "}
            <code>lib/botchain/abi.ts</code> and this page.
          </p>
        </Panel>

        <BotChainGate>
          <Panel>
            <p className="text-[11px] uppercase tracking-[0.04em]" style={{ color: "var(--text-secondary)" }}>
              The one transaction
            </p>
            <p className="mt-2 text-[13px]" style={{ color: "var(--text-primary)" }}>
              {app.theTx}
            </p>
          </Panel>
        </BotChainGate>
      </div>
    </PageShell>
  );
}
