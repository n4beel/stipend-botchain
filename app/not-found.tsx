import Link from "next/link";
import PageShell from "@/components/layout/PageShell";

export default function NotFound() {
  return (
    <PageShell
      title="404 - Pot Not Found"
      description="The pot or route you requested could not be located on the Stipend meter."
    >
      <div className="rounded-xl border border-[#3B1646]/30 bg-[#3B1646]/10 p-8 text-center space-y-4">
        <div className="text-4xl font-mono text-[#7DF0C0]">404</div>
        <p className="text-sm text-white/70">
          The requested page does not exist. Check the pot identifier or return to the overview.
        </p>
        <div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-[#7DF0C0] px-4 py-2 text-sm font-semibold text-[#180A1F] hover:bg-[#7DF0C0]/90 transition"
          >
            Back to Pots
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
