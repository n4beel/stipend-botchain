import { activeBotChain, addressUrl } from "@/lib/botchain/chain";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";

/**
 * The footer's "Built on BOT Chain", linked to this app's own contract on the explorer.
 *
 * The claim is only worth making if the reader can check it in one click, so the text points at
 * the deployment for the network this build targets rather than at the chain's homepage. With no
 * deployment configured there is nothing to point at, and it stays plain text instead of linking
 * to the zero address.
 */
export default function BuiltOnBotChain({
  className,
  style,
  label = "Built on BOT Chain",
}: {
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}) {
  const chainId = activeBotChain.id;

  if (!isDeployed(chainId)) {
    return (
      <span className={className} style={style}>
        {label}
      </span>
    );
  }

  return (
    <a
      href={addressUrl(chainId, getDeployment(chainId).address)}
      target="_blank"
      rel="noreferrer"
      className={className}
      style={style}
      title="View this app's contract on the BOT Chain explorer"
    >
      {label}
    </a>
  );
}
