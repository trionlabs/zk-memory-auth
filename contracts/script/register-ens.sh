#!/usr/bin/env bash
# Registers `<label>.eth` on Sepolia ENS by talking directly to the
# ETHRegistrarController. Two transactions, separated by the controller's
# minCommitmentAge (60s on Sepolia), with a real wall-clock wait between them.
#
# The Foundry-script equivalent does not work reliably because
# forge script collects all vm.broadcast() calls and submits them back-to-back
# in the broadcast phase regardless of any vm.sleep that ran during simulation.
# Bash + cast gives us a real sleep between independent tx submissions.
#
# Required env:
#   PLATFORM_KEY      private key of the wallet that will own the registered name
#   ENS_LABEL         label without ".eth", e.g. "zkmemory-myhospital"
# Optional:
#   ENS_DURATION      seconds (default 31536000 = 1y)
#   ENS_RESOLVER      resolver address to set during register (default 0x0)
#   ENS_REVERSE       1 for reverse record (default 0)
#   SEPOLIA_RPC_URL   default https://ethereum-sepolia-rpc.publicnode.com
#   ENS_CONTROLLER    default 0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968

set -euo pipefail

: "${PLATFORM_KEY:?PLATFORM_KEY env var required}"
: "${ENS_LABEL:?ENS_LABEL env var required}"
RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
CTRL="${ENS_CONTROLLER:-0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968}"
DURATION="${ENS_DURATION:-31536000}"
RESOLVER="${ENS_RESOLVER:-0x0000000000000000000000000000000000000000}"
REVERSE="${ENS_REVERSE:-0}"

OWNER=$(cast wallet address "$PLATFORM_KEY")
echo "controller: $CTRL"
echo "label:      $ENS_LABEL"
echo "owner:      $OWNER"
echo "duration:   $DURATION"
echo "rpc:        $RPC"

available=$(cast call --rpc-url "$RPC" "$CTRL" 'available(string)(bool)' "$ENS_LABEL")
if [ "$available" != "true" ]; then
  echo "ERROR: $ENS_LABEL.eth is not available" >&2
  exit 1
fi

# rentPrice returns (uint256 base, uint256 premium) on two lines, with cast
# appending a scientific-notation annotation in brackets. Parse line-by-line
# and take the first whitespace-delimited token (the raw integer) only.
prices=$(cast call --rpc-url "$RPC" "$CTRL" \
  'rentPrice(string,uint256)(uint256,uint256)' "$ENS_LABEL" "$DURATION")
base=$(echo "$prices"   | sed -n '1p' | awk '{print $1}')
premium=$(echo "$prices" | sed -n '2p' | awk '{print $1}')
total=$(python3 -c "print($base + $premium)")
buffered=$(python3 -c "print(int($total * 1.05))")
echo "rentPrice:  base=$base premium=$premium  total=$total  with-5%-buffer=$buffered wei"

# Random 32-byte secret. Reuses across both txs - register must match commit exactly.
SECRET="0x$(openssl rand -hex 32)"
echo "secret:     $SECRET"

# Compute the commitment (controller view function does the keccak; cheaper than reimplementing).
COMMITMENT=$(cast call --rpc-url "$RPC" "$CTRL" \
  'makeCommitment((string,address,uint256,bytes32,address,bytes[],uint8,bytes32))(bytes32)' \
  "(\"$ENS_LABEL\",$OWNER,$DURATION,$SECRET,$RESOLVER,[],$REVERSE,0x0000000000000000000000000000000000000000000000000000000000000000)")
echo "commitment: $COMMITMENT"

echo
echo "[1/2] sending commit()..."
cast send --rpc-url "$RPC" --private-key "$PLATFORM_KEY" "$CTRL" \
  'commit(bytes32)' "$COMMITMENT"

# Wait past minCommitmentAge plus a buffer for block-time variance.
MIN_AGE=$(cast call --rpc-url "$RPC" "$CTRL" 'minCommitmentAge()(uint256)')
WAIT=$((MIN_AGE + 10))
echo
echo "waiting ${WAIT}s for commitment to age past minCommitmentAge=${MIN_AGE}s..."
for ((i=WAIT; i>0; i--)); do
  printf "  %ds remaining...\r" "$i"
  sleep 1
done
echo

echo "[2/2] sending register()..."
cast send --rpc-url "$RPC" --private-key "$PLATFORM_KEY" --value "$buffered" "$CTRL" \
  'register((string,address,uint256,bytes32,address,bytes[],uint8,bytes32))' \
  "(\"$ENS_LABEL\",$OWNER,$DURATION,$SECRET,$RESOLVER,[],$REVERSE,0x0000000000000000000000000000000000000000000000000000000000000000)"

echo
echo "registered: ${ENS_LABEL}.eth -> $OWNER"
