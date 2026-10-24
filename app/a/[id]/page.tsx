import PageShell from "@/components/layout/PageShell";
import AllowanceDetailView from "@/components/stipend/AllowanceDetailView";

interface AllowancePageProps {
  params: Promise<{ id: string }>;
}

export default async function AllowancePage({ params }: AllowancePageProps) {
  const { id } = await params;
  let allowanceId: bigint;
  try {
    allowanceId = BigInt(id);
  } catch {
    return (
      <PageShell title="Invalid Allowance">
        <div className="p-8 text-center text-[#FFC86B] font-mono text-sm">
          Invalid allowance identifier: {id}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <AllowanceDetailView id={allowanceId} />
    </PageShell>
  );
}
