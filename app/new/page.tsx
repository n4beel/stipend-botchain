import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import CreateAllowanceForm from "@/components/stipend/CreateAllowanceForm";

export default function NewAllowancePage() {
  return (
    <PageShell
      title="Create Allowance Pot"
      description="Fund a pot and set a recurring spending limit for a family member, contractor, or team member."
    >
      <BotChainGate noWalletNote="You need a connected wallet on Bohr or BOT Chain to fund a pot and create an allowance.">
        <CreateAllowanceForm />
      </BotChainGate>
    </PageShell>
  );
}
