#!/usr/bin/env bash
#
# Deploy to a BOT Chain network, then verify the source on the explorer.
#
#   ./deploy.sh bohr          # Bohr testnet
#   ./deploy.sh botchain      # mainnet — real BOT, and there is no faucet
#   ./deploy.sh bohr --dry    # simulate, broadcast nothing
#
# Three things this does that the bare forge command does not:
#
#  1. Normalises the private key. `vm.envUint` rejects a key without a `0x` prefix, with an error
#     that reads like the key is malformed rather than merely unprefixed. Both forms are the same
#     key and every other tool here takes both.
#  2. Asks the node what chain it is on and refuses to broadcast if it disagrees with the network
#     named on the command line. An RPC quietly pointed at the wrong chain is the one mistake here
#     that spends real money irreversibly.
#  3. Verifies the source afterwards. Both explorers run Blockscout, so a deployed contract can be
#     made readable to anyone — worth having before asking for an ecosystem listing.
set -euo pipefail

NETWORK=${1:-}
DRY=${2:-}

case "$NETWORK" in
  bohr)     EXPECTED_ID=968; RPC_VAR=BOHR_RPC_URL;     EXPLORER_API=https://scan.bohr.life/api ;;
  botchain) EXPECTED_ID=677; RPC_VAR=BOTCHAIN_RPC_URL; EXPLORER_API=https://scan.botchain.ai/api ;;
  *) echo "usage: $0 <bohr|botchain> [--dry]" >&2; exit 64 ;;
esac

HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE"

ENV_FILE="$HERE/../.env"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi

# forge resolves every `${...}` in foundry.toml's [etherscan] block before it runs, whether or not
# the command needs it, so these must exist even for a plain deploy.
export BOHR_VERIFIER_URL=${BOHR_VERIFIER_URL:-https://scan.bohr.life/api}
export BOTSCAN_VERIFIER_URL=${BOTSCAN_VERIFIER_URL:-https://scan.botchain.ai/api}
# Blockscout ignores the key, but forge insists one is set.
export BOTSCAN_API_KEY=${BOTSCAN_API_KEY:-unset}

if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo "DEPLOYER_PRIVATE_KEY is not set. Put it in $ENV_FILE or export it." >&2
  exit 1
fi
# `${var#0x}` strips the prefix only if present, so this is idempotent and never doubles it.
export DEPLOYER_PRIVATE_KEY="0x${DEPLOYER_PRIVATE_KEY#0x}"

RPC=${!RPC_VAR:-}
if [ -z "$RPC" ]; then
  echo "$RPC_VAR is not set." >&2
  exit 1
fi

ACTUAL_ID=$(cast chain-id --rpc-url "$RPC")
if [ "$ACTUAL_ID" != "$EXPECTED_ID" ]; then
  echo "refusing to deploy: $RPC_VAR reports chain $ACTUAL_ID, but '$NETWORK' must be $EXPECTED_ID" >&2
  exit 1
fi

echo "network   $NETWORK (chain $ACTUAL_ID)"
echo "rpc       $RPC"

if [ "$DRY" = "--dry" ]; then
  echo "mode      simulation, nothing will be broadcast"
  exec forge script script/Deploy.s.sol --rpc-url "$RPC"
fi

if [ "$NETWORK" = "botchain" ]; then
  echo
  echo "This is MAINNET. Real BOT, and there is no faucet."
  echo
fi

forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast

# Verification must not fail the deploy. The contract is on chain by this point, and an explorer
# slow to index is a reason to retry the verify, not to treat the deployment as broken.
# Both the address and the contract name come from the broadcast log. The name matters: a first
# attempt picked `ls src/*.sol | head -1`, which is alphabetical, so a project whose entry point is
# TokenFactory.sol had its factory submitted for verification as ForgedToken. Any project with
# more than one contract in src/ hits that.
read -r CONTRACT NAME <<EOS
$(python3 -c "
import json, pathlib, sys
data = json.loads(pathlib.Path('broadcast/Deploy.s.sol/' + sys.argv[1] + '/run-latest.json').read_text())
created = [t for t in data['transactions'] if t.get('transactionType') == 'CREATE']
print(created[-1]['contractAddress'], created[-1].get('contractName', '') if created else '')
" "$EXPECTED_ID")
EOS

if [ -z "$CONTRACT" ] || [ -z "$NAME" ]; then
  echo "could not read the deployment out of the broadcast log; verify by hand" >&2
  exit 0
fi

SRC=$(grep -rl "contract $NAME" src/*.sol | head -1)
if [ -z "$SRC" ]; then
  echo "could not find the source file declaring $NAME; verify by hand" >&2
  exit 0
fi

echo
echo "verifying $NAME at $CONTRACT"
forge verify-contract "$CONTRACT" "$SRC:$NAME" \
  --verifier blockscout --verifier-url "$EXPLORER_API" \
  --rpc-url "$RPC" --watch \
  || {
    echo >&2
    echo "verification did not complete. Rerun:" >&2
    echo "  forge verify-contract $CONTRACT $SRC:$NAME --verifier blockscout --verifier-url $EXPLORER_API --rpc-url $RPC --watch" >&2
  }
