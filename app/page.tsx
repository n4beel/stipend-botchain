import PageShell from "@/components/layout/PageShell";
import AllowanceList from "@/components/stipend/AllowanceList";

export default function Home() {
  return (
    <PageShell
      title="Spending Pots"
      description="Recurring allowances funded by guardians and drawn on demand. Refills at each period boundary."
    >
      <AllowanceList />
    </PageShell>
  );
}
