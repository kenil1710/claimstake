# ClaimStake

Adversarial fact-checking with money on both sides, settled by GenLayer validators.

Someone quotes a claim published on a live web page and stakes GEN behind it being false.
Someone else matches that stake exactly and argues it holds up. Independent validators fetch
the page and both sides' evidence, judge it, and must agree on a verdict before it counts.
The loser's stake crosses to the winner minus a protocol fee, paid by the contract in the same
call that decides the verdict.

**Live app:** https://claimstake.vercel.app
**Contract:** [`0xAae01C25C577BCcddfb0408CB3eF6076d0BA4500`](https://explorer-bradbury.genlayer.com/address/0xAae01C25C577BCcddfb0408CB3eF6076d0BA4500) on GenLayer Bradbury Testnet (chain 4221)

GEN on Bradbury is test currency with no real-world value.

---

## Why this needs a chain

Asking a model whether a claim is true gives you an answer nobody is accountable for, that
nobody else can check, with nothing behind it. Three properties change that, and none of them
survive off-chain:

- **Several validators judge independently and must agree.** One model having a bad day does
  not decide where the money goes — it fails to agree, and the network tries again.
- **Both stakes sit in the contract from the moment they are placed.** No operator holds the
  float, and neither party can withdraw mid-dispute.
- **Settlement is the same transaction as the verdict.** Nobody has to be trusted to pay out,
  and there is no privileged step between deciding and paying.

## How a dispute runs

| | |
|---|---|
| **1. Filed** | Challenger quotes the claim, links the page, stakes GEN. The contract fetches the page and pins an FNV-1a hash of its text. |
| **2. Open** | Anyone may take the defending side by matching the stake **exactly**. If nobody does before the join deadline, the stake is returned in full. |
| **3. Active** | Both stakes are locked. Neither party can withdraw. |
| **4. Settled** | Validators judge; the contract pays the winner in the same call. |

Verdicts are `TRUE` (defender wins), `FALSE` (challenger wins), or `INCONCLUSIVE` — opinion,
prediction, unreachable source, or evidence too thin either way. An inconclusive verdict takes
**no fee** and returns each side its exact stake.

---

## Consensus design

This is the part reviewers usually want to interrogate, so it is spelled out rather than
summarised.

### What the validators actually compare

`resolve_dispute` runs `gl.vm.run_nondet(leader_fn, validator_fn)`. Each validator independently
fetches the claim page and both evidence sets, runs the same judgement, and compares **the
verdict, exactly**:

```python
return mine["verdict"] == theirs
```

The verdict is the only compared axis, deliberately. Every additional equality condition is
another way to land `UNDETERMINED`, and a dispute that cannot settle is a worse failure than one
whose confidence figure was not cross-checked.

Before that comparison, two **pure** gates run on the leader's own calldata. Being pure, every
validator computes an identical answer, so they can reject a bad leader without ever becoming a
source of disagreement:

- `_coherent(verdict, reasoning)` — rejects a leader whose stored reasoning contradicts the
  verdict it carried (`verdict=TRUE` alongside "the claim is false"), and rejects reasoning under
  40 characters. This closes the cheapest forgery: a plausible-looking record attached to a
  verdict it does not support.
- Reachability — a leader claiming the page was unreachable must return `INCONCLUSIVE`. An
  unread page is not a false claim.

Reachability is also checked **one-directionally** against the validator's own fetch, so a leader
cannot force a cheap rejection by claiming a page it could reach is dead, while a validator's own
failed fetch is never treated as evidence against a leader that succeeded.

### What consensus does not verify — stated plainly

The **verdict is consensus-verified, and the verdict is what moves the money.** The narrative
fields stored alongside it — the exact wording of `reasoning`, the `confidence` figure, the
`page_changed` and `injection_flagged` indicators — come from the lead validator and are bound
only by the coherence gate above.

That boundary is a deliberate trade, not an oversight. Making free-text reasoning or a 0–100
confidence score an exact consensus axis would mean two honest validators disagreeing on wording
could deadlock a settlement and strand two stakes. So the payout-controlling output is verified
strictly, and the commentary around it is labelled as testimony — in this README, and in the app
on every settled dispute.

### Guaranteed exit

Non-deterministic consensus offers no guarantee it will ever converge. Left there, two committed
stakes could sit locked forever. Two mechanisms close that:

- `resolve_dispute` is **permissionless** — no owner check, no party restriction — and is
  **not gated on the pause switch**. Pause stops new risk arriving (`create_dispute` and
  `defend_dispute` both check it) but must never trap money already on the table.
- `settle_stalled` is the backstop. Once `resolution_window` has elapsed past the join deadline,
  **anyone** may close an ACTIVE dispute as `INCONCLUSIVE`: both stakes returned in full, no fee.
  It needs no owner and works while paused, because a refund path only the owner can trigger is
  not a guarantee.

The owner therefore cannot change a verdict, cannot select a winner, and cannot withhold a payout.

### Hostile page content

Fetched pages and evidence are third-party text that the judging prompt has to read. It is
treated as data, never instruction:

- Everything fetched is wrapped in `<<<UNTRUSTED_CONTENT_BEGIN/END>>>` fences, and the fence
  token names are **stripped from the content itself**, so a page cannot close the fence and
  address the evaluator from outside it.
- Zero-width and bidi control characters are removed **first**, so they cannot be used to split a
  fence token into something the stripper misses.
- Text that addresses the evaluator directly is flagged on the dispute record and surfaced in the
  prompt as bad faith by the side that filed it. The flag is advisory — it never decides a verdict.

Defanging is deterministic and pure, so leader and validators defang identically and it adds
nothing to the consensus surface.

### Evidence pinning

`claim_hash` is an FNV-1a hash computed by hand over whitespace-collapsed page text. Python's
built-in `hash()` is seeded per process and would make leader and validators disagree for no
reason. Whitespace is collapsed first because reflow between two renders is noise, not a content
change. The hash is pinned at filing and compared at resolution, so a page edited to escape a
challenge shows on the record.

### Money safety

- **Fee is divide-before-multiply**: `(pot // 10000) * bps`. The intermediate never exceeds the
  pot, so it cannot overflow where `pot * bps` would. Truncation is at most a few wei and always
  favours the winner; `payout` is defined by subtraction, so not one wei is stranded.
- **Payable methods never revert on bad input.** GenVM rolls back contract state on a `UserError`
  but does **not** return the value that rode in with the call — it stays in the contract,
  unaccounted and unreachable. An early run stranded 102.5 GEN across 17 rejected calls before
  this was understood. So `create_dispute` and `defend_dispute` answer a rejection with a
  *successful* transaction that refunds and returns `{"ok": false, "reason": ...}`. **Callers must
  read `ok` before assuming a stake was taken.**
- **`sweep_unallocated` cannot reach committed money.** It is capped at balance minus
  (locked stakes + unwithdrawn fees), and refuses to run within an hour of the contract's last
  outbound transfer, because transfers apply on finalisation and a pending payout would otherwise
  look exactly like a surplus.
- **In-flight guard.** A resolve already under way is refused for 20 minutes, so a dispute cannot
  be jammed by repeated concurrent submissions. It is self-healing: an `UNDETERMINED` transaction
  applies no state, so a failed resolve leaves no lock behind.

### Anti-abuse

| Control | Value |
|---|---|
| Per-wallet cooldown between filings | 180s |
| Defender must match challenger's stake | exactly, to the wei |
| Self-defence | rejected and refunded |
| Evidence URLs per side | max 5, `http(s)` only, ≤500 chars, deduped |
| Claim length | 12–300 characters |
| Stake bounds | 0.01 – 100 GEN (owner-adjustable) |
| Protocol fee | 5%, hard-capped at 10% |

---

## Repository layout

```
contracts/claim_stake.py     the intelligent contract
frontend/                    Next.js app (marketing site + dApp)
test/                        offline logic tests, deploy, acceptance and regression suites
```

## Testing, step by step

### 1. Offline logic tests — no chain, no network, milliseconds

Every pure helper the contract relies on is module-level and free of `self`, which is what lets
these run in CPython against a stubbed `genlayer` module. Anything that would reach a node raises
loudly from the stub, so a test cannot quietly pass by pretending to do non-deterministic work.

```bash
cd test
python3 test_logic.py     # 182 assertions: fee math, URL parsing, defanging,
                          # injection detection, hashing, coherence, time
python3 audit_probe.py    # 6 probes answering the security questions above directly
```

### 2. Deploy your own instance

Requires a funded Bradbury wallet. `--gas` is a floor; the script raises it to the real estimate
if that is higher.

```bash
cd test
npm install
node deploy.mjs --network=bradbury --gas=80000000 --write-env
```

`--write-env` rewrites `frontend/.env.local` with the new address. To sign from a GenLayer CLI
keystore instead of the bundled test account:

```bash
export GENLAYER_KEYSTORE_PASSWORD=...   # never passed as an argv flag; argv is visible via ps
node deploy.mjs --network=bradbury --gas=80000000 --keystore=<name>
```

### 3. Acceptance suite — the eight scenarios a reviewer asks for

```bash
cd test
node suite.mjs --network=bradbury
```

| Test | Scenario | Expected |
|---|---|---|
| 1 | "The Eiffel Tower is in London" | `FALSE`, challenger takes the pot |
| 2 | "The Earth orbits the Sun" | `TRUE`, defender takes the pot |
| 3 | A matter of opinion | `INCONCLUSIVE`, both refunded, no fee |
| 4 | Challenger withdraws before anyone defends | stake returned in full |
| 5 | Nobody defends before the deadline | stake returned in full |
| 6 | Page orders the validator to return a verdict | injection flagged, verdict unaffected |
| 7 | Two wallets race for one defender seat | one wins, the loser is **refunded**, no fund loss |
| 8 | Ledger reconciliation | contract holds only its fees; unallocated is `0` |

Test 5 needs a five-minute window to lapse, so its dispute is seeded first and collected last;
everything else runs inside that window. Seven creates means seven distinct wallets, because of
the 180s per-wallet cooldown.

### 4. Full regression suite

```bash
node e2e.mjs --network=bradbury
```

Exhaustive: every view method, every rejection path, balance deltas asserted per wallet.

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

`frontend/.env.example` documents the configuration. `NEXT_PUBLIC_NETWORK` is `bradbury` or
`studionet`; the network label and explorer links derive from it, so no deployment can advertise
a chain it was moved off.

---

## Architecture notes

**Why the frontend proxies RPC on Studionet.** Studio meters per IP and answers an exhausted quota
with a bare 429 carrying no `Access-Control-Allow-Origin`. The browser reports that as a CORS
violation, not as the rate limit it is — identical symptom to a closed endpoint, entirely
different cause. `app/api/rpc` relays server-to-server so the browser sees a readable status.
Bradbury serves CORS headers on errors too, so it is called directly.

**Why a reverted transaction is treated as a failure.** The SDK reports a reverted transaction as
an ordinary settled one. The revert lives at `consensus_data.leader_receipt[0].execution_result`
on Studionet and `txExecutionResultName` on Bradbury; reading neither makes a rolled-back call
look like a success.

**Why `LEADER_TIMEOUT` is not treated as terminal.** It is not — the network rotates to the next
leader and carries on. Stopping there abandons a transaction that is still alive and reports a
failure that never happened.

## License

MIT
