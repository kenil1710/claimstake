"use client";

import Link from "next/link";
import useSWR from "swr";
import { getStats } from "@/lib/contract";
import { HeroMatchup } from "@/components/HeroMatchup";
import { CountUp, Reveal, SideReveal, Stagger, StaggerItem } from "@/components/Motion";
import { formatGen } from "@/lib/format";

/**
 * The landing page.
 *
 * Sells the idea and hands off to /docket. It deliberately holds no dispute
 * form, no wallet connect and no writeable surface of any kind — the only
 * chain access is the read-only stats strip, which needs no signer.
 */

const STEPS = [
  {
    n: "01",
    title: "Challenge a claim",
    body: "Paste the URL, quote the sentence you say is wrong, and stake GEN behind it. The contract fetches the page and pins a hash of it, so an edit after filing shows on the record.",
  },
  {
    n: "02",
    title: "Someone defends",
    body: "Anyone can take the other side by matching your stake exactly — not more, not less. Equal money is what makes the result mean something.",
  },
  {
    n: "03",
    title: "Validators judge",
    body: "Independent validators fetch the source and both sides' evidence, weigh them, and have to agree on a verdict before it counts.",
  },
  {
    n: "04",
    title: "Winner takes the pot",
    body: "The loser's stake goes to the winner, minus a small protocol fee. Settlement is a contract call — nobody has to be trusted to pay out.",
  },
];

const PILLARS = [
  {
    title: "Independent validators",
    body: "Several validators run the same judgement separately and must reach the same verdict. One model having a bad day does not decide where the money goes.",
  },
  {
    title: "Money held in escrow",
    body: "Both stakes sit in the contract from the moment they are placed. Nobody can withdraw mid-dispute, and no operator holds the float.",
  },
  {
    title: "The verdict is public",
    body: "The reasoning, the confidence, the page as it was read, and the payout are all on chain. You can check the call that paid out.",
  },
];

const WORKS = [
  "Fact claims on a live web page",
  "Wikipedia and reference accuracy",
  "Company promises with a published spec",
  "Protocol claims with public documentation",
];

const DOESNT = [
  "Opinions and taste",
  "Predictions about the future",
  "Anything behind a login",
  "Claims a page never actually made",
];

export default function LandingPage() {
  const { data: stats } = useSWR("landing-stats", getStats, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });

  const settled = stats?.resolved ?? 0;
  const decided = (stats?.challenger_wins ?? 0) + (stats?.defender_wins ?? 0);
  const challengerRate = decided > 0 ? ((stats!.challenger_wins / decided) * 100) : 0;
  const staked = stats ? Number(formatGen(stats.total_volume, 4)) : 0;

  return (
    <>
      {/* ══ 1. HERO ══════════════════════════════════════════════════════ */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div className="glow glow-challenger" style={{ width: 520, height: 520, top: -170, left: -180 }} />
        <div className="glow glow-defender" style={{ width: 480, height: 480, top: -120, right: -170 }} />

        <div
          className="shell"
          style={{
            position: "relative",
            zIndex: 2,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: "3.5rem",
            alignItems: "center",
            minHeight: "calc(100dvh - 64px)",
            paddingBlock: "4rem",
          }}
        >
          <div>
            <Reveal>
              <div className="eyebrow" style={{ marginBottom: "1.4rem" }}>
                Adversarial fact-checking, settled on chain
              </div>
            </Reveal>

            <Reveal delay={0.06}>
              <h1
                className="display-black"
                style={{ fontSize: "clamp(2.9rem, 7.4vw, 5.1rem)", marginBottom: "1.5rem" }}
              >
                Put money
                <br />
                where your
                <br />
                mouth is.
              </h1>
            </Reveal>

            <Reveal delay={0.12}>
              <p className="lede" style={{ maxWidth: "46ch", marginBottom: "2.25rem" }}>
                Challenge any claim on the internet. Stake against it. GenLayer validators
                settle who&rsquo;s right. Winner takes the pot.
              </p>
            </Reveal>

            <Reveal delay={0.18}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <Link href="/docket" className="btn">
                  Launch app
                </Link>
                <Link href="/docs" className="btn btn-ghost">
                  Read the docs
                </Link>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.24} y={30}>
            <HeroMatchup />
          </Reveal>
        </div>
      </section>

      {/* ══ 2. HOW IT WORKS ══════════════════════════════════════════════ */}
      <section className="shell" style={{ paddingBlock: "6rem" }}>
        <Reveal>
          <div className="eyebrow" style={{ marginBottom: "0.9rem" }}>
            How it works
          </div>
          <h2 className="display-black" style={{ fontSize: "clamp(2rem, 4.6vw, 3.1rem)", maxWidth: "18ch" }}>
            Four steps, one contract.
          </h2>
        </Reveal>

        <Stagger
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1px",
            background: "var(--line)",
            border: "1px solid var(--line)",
            marginTop: "3rem",
          }}
        >
          {STEPS.map((step) => (
            <StaggerItem key={step.n} style={{ background: "var(--surface)", padding: "1.75rem 1.5rem" }}>
              <div
                className="amount"
                style={{ fontSize: "2.1rem", color: "var(--text-faint)", marginBottom: "1rem" }}
              >
                {step.n}
              </div>
              <h3 className="display" style={{ fontSize: "1.2rem", marginBottom: "0.6rem" }}>
                {step.title}
              </h3>
              <p style={{ fontSize: "0.9rem", color: "var(--text-dim)", lineHeight: 1.62 }}>{step.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ══ 3. EXAMPLE VERDICT ═══════════════════════════════════════════ */}
      <section style={{ borderBlock: "1px solid var(--line)", background: "var(--surface)" }}>
        <div
          className="shell"
          style={{
            paddingBlock: "6rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "3.5rem",
            alignItems: "center",
          }}
        >
          <SideReveal side="challenger">
            <div className="eyebrow" style={{ marginBottom: "0.9rem" }}>
              A settled dispute
            </div>
            <h2 className="display-black" style={{ fontSize: "clamp(1.9rem, 4.2vw, 2.8rem)", marginBottom: "1.2rem" }}>
              The seam tells you who won.
            </h2>
            <p className="lede" style={{ maxWidth: "42ch" }}>
              While both sides are live the bar sits dead centre, because the stakes are forced
              to match. When a verdict lands it slides — and you can read the outcome of a
              whole docket without reading a word of it.
            </p>
          </SideReveal>

          <SideReveal side="defender">
            <div className="card" style={{ padding: "1.4rem", background: "var(--void)" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <span className="eyebrow">Example</span>
                <span style={{ flex: 1 }} />
                <span className="chip" style={{ color: "var(--text-dim)" }}>
                  Settled
                </span>
                <span className="chip chip-solid" style={{ background: "var(--challenger)", color: "#14090a" }}>
                  False
                </span>
              </div>

              <p className="display" style={{ fontSize: "1.3rem", lineHeight: 1.25, marginBottom: "1.4rem" }}>
                The Eiffel Tower is located in London, England.
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  marginBottom: "0.5rem",
                }}
              >
                <div>
                  <div className="eyebrow" style={{ color: "var(--challenger)" }}>
                    Challenger · false
                  </div>
                  <div className="amount" style={{ fontSize: "1.1rem", color: "var(--challenger)" }}>
                    0.01 <span style={{ fontSize: "0.68rem", opacity: 0.65 }}>GEN</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="eyebrow">Defender · true</div>
                  <div className="amount" style={{ fontSize: "1.1rem", color: "var(--text-faint)" }}>
                    0.01 <span style={{ fontSize: "0.68rem", opacity: 0.65 }}>GEN</span>
                  </div>
                </div>
              </div>

              <div
                className="meter meter--challenger-won"
                style={{ ["--split" as string]: "87%", height: "2.75rem" }}
                aria-hidden="true"
              >
                <div className="meter__edge" />
                <div className="meter__fill" />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "1rem",
                  marginTop: "1.25rem",
                  paddingTop: "1.1rem",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <div>
                  <div className="eyebrow">Pot</div>
                  <div className="amount" style={{ fontSize: "1rem" }}>0.02</div>
                </div>
                <div>
                  <div className="eyebrow">Fee</div>
                  <div className="amount" style={{ fontSize: "1rem" }}>0.001</div>
                </div>
                <div>
                  <div className="eyebrow">To winner</div>
                  <div className="amount" style={{ fontSize: "1rem", color: "var(--challenger)" }}>
                    0.019
                  </div>
                </div>
              </div>
            </div>
          </SideReveal>
        </div>
      </section>

      {/* ══ 4. WHY ON-CHAIN ══════════════════════════════════════════════ */}
      <section className="shell" style={{ paddingBlock: "6rem" }}>
        <Reveal>
          <div className="eyebrow" style={{ marginBottom: "0.9rem" }}>
            Why this has to be on chain
          </div>
          <h2 className="display-black" style={{ fontSize: "clamp(2rem, 4.6vw, 3.1rem)", maxWidth: "20ch" }}>
            Not ChatGPT. Not one AI&rsquo;s opinion.
          </h2>
          <p className="lede" style={{ maxWidth: "58ch", marginTop: "1.1rem" }}>
            Asking a chatbot whether a claim is true gives you an answer nobody is accountable
            for, that nobody else can check, with no money behind it. Three things change that,
            and none of them work without a contract holding the stakes.
          </p>
        </Reveal>

        <Stagger
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1.25rem",
            marginTop: "3rem",
          }}
        >
          {PILLARS.map((pillar) => (
            <StaggerItem key={pillar.title}>
              <div className="card card-hover" style={{ padding: "1.6rem", height: "100%" }}>
                <h3 className="display" style={{ fontSize: "1.15rem", marginBottom: "0.7rem" }}>
                  {pillar.title}
                </h3>
                <p style={{ fontSize: "0.9rem", color: "var(--text-dim)", lineHeight: 1.62 }}>
                  {pillar.body}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ══ 5. WHAT YOU CAN CHALLENGE ════════════════════════════════════ */}
      <section style={{ borderBlock: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="shell" style={{ paddingBlock: "6rem" }}>
          <Reveal>
            <div className="eyebrow" style={{ marginBottom: "0.9rem" }}>
              What you can challenge
            </div>
            <h2 className="display-black" style={{ fontSize: "clamp(2rem, 4.6vw, 3.1rem)", maxWidth: "22ch" }}>
              A source has to be able to settle it.
            </h2>
          </Reveal>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.25rem",
              marginTop: "3rem",
            }}
          >
            <SideReveal side="defender">
              <div
                className="card"
                style={{ padding: "1.6rem", height: "100%", borderColor: "var(--defender-dim)" }}
              >
                <div className="eyebrow" style={{ color: "var(--defender)", marginBottom: "1.1rem" }}>
                  Settles cleanly
                </div>
                <ul style={{ listStyle: "none", display: "grid", gap: "0.85rem" }}>
                  {WORKS.map((item) => (
                    <li key={item} style={{ display: "flex", gap: "0.7rem", fontSize: "0.94rem" }}>
                      <span style={{ color: "var(--defender)", fontWeight: 700 }}>&#43;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </SideReveal>

            <SideReveal side="challenger">
              <div
                className="card"
                style={{ padding: "1.6rem", height: "100%", borderColor: "var(--line-bright)" }}
              >
                <div className="eyebrow" style={{ marginBottom: "1.1rem" }}>
                  Comes back inconclusive
                </div>
                <ul style={{ listStyle: "none", display: "grid", gap: "0.85rem" }}>
                  {DOESNT.map((item) => (
                    <li
                      key={item}
                      style={{ display: "flex", gap: "0.7rem", fontSize: "0.94rem", color: "var(--text-dim)" }}
                    >
                      <span style={{ color: "var(--neutral)", fontWeight: 700 }}>&minus;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </SideReveal>
          </div>

          <Reveal delay={0.1}>
            <p
              style={{
                fontSize: "0.9rem",
                color: "var(--text-dim)",
                marginTop: "1.5rem",
                maxWidth: "64ch",
              }}
            >
              An inconclusive verdict is not a loss. No fee is taken and both sides get their
              exact stake back — so the cost of misjudging what is checkable is the gas, not
              the stake.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ══ 6. STATS ═════════════════════════════════════════════════════ */}
      <section className="shell" style={{ paddingBlock: "3.5rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "1px",
            background: "var(--line)",
            border: "1px solid var(--line)",
          }}
        >
          <div style={{ background: "var(--void)", padding: "1.4rem 1.5rem" }}>
            <div className="eyebrow" style={{ marginBottom: "0.5rem" }}>
              Disputes settled
            </div>
            <div className="amount" style={{ fontSize: "1.9rem" }}>
              <CountUp value={settled} />
            </div>
          </div>
          <div style={{ background: "var(--void)", padding: "1.4rem 1.5rem" }}>
            <div className="eyebrow" style={{ marginBottom: "0.5rem" }}>
              Total staked
            </div>
            <div className="amount" style={{ fontSize: "1.9rem" }}>
              <CountUp value={staked} decimals={2} suffix=" GEN" />
            </div>
          </div>
          <div style={{ background: "var(--void)", padding: "1.4rem 1.5rem" }}>
            <div className="eyebrow" style={{ marginBottom: "0.5rem" }}>
              Challenger win rate
            </div>
            <div className="amount" style={{ fontSize: "1.9rem", color: "var(--challenger)" }}>
              {decided > 0 ? <CountUp value={challengerRate} suffix="%" /> : <span className="num">—</span>}
            </div>
          </div>
        </div>
      </section>

      {/* ══ 7. CLOSING CTA ═══════════════════════════════════════════════ */}
      <section style={{ position: "relative", overflow: "hidden", borderTop: "1px solid var(--line)" }}>
        <div className="glow glow-challenger" style={{ width: 400, height: 400, bottom: -220, left: "12%" }} />
        <div className="glow glow-defender" style={{ width: 400, height: 400, bottom: -220, right: "12%" }} />

        <div
          className="shell"
          style={{ position: "relative", zIndex: 2, paddingBlock: "7rem", textAlign: "center" }}
        >
          <Reveal>
            <h2
              className="display-black"
              style={{ fontSize: "clamp(2.3rem, 6vw, 4rem)", marginBottom: "1.5rem" }}
            >
              Ready to challenge something?
            </h2>
            <p className="lede" style={{ maxWidth: "44ch", margin: "0 auto 2.25rem" }}>
              Find an open seat and take the other side, or file a claim of your own.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/docket" className="btn">
                Launch app
              </Link>
              <Link href="/challenge" className="btn btn-ghost">
                File a challenge
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
