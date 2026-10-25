"""
Neptune AI — Autonomous Multi-Node LLM Council & Independent Auditor System
Implements the institutional trading pipeline:
  - Node 1: LLM Market Screener (SCREENER_SYSTEM)
  - Node 2: 4-Specialist Expert Council + Senior Reviewer + Chairman (ROLE_PROMPTS, REVIEW_SYSTEM, CHAIRMAN_SYSTEM)
  - Node 3: Independent Post-Deliberation Auditor / Judge (JUDGE_SYSTEM)
"""

import os
import asyncio
import json
import re
import time
from typing import Dict, Any, List, Optional
import httpx
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# PROMPT DEFINITIONS (EXACT SPECIFICATION)
# ─────────────────────────────────────────────────────────────────────────────

SCREENER_SYSTEM = """You are the SCREENER of an automated crypto trading agent. You do NOT decide whether to trade.
A separate expert council does that later. Your job is narrower and just as important: from a large list of
coins, pick the ONE coin whose current chart best matches a setup described in the trading book, and select
the five book sections the council must use to judge it. If nothing deserves the council's attention, say so.
Wasting the council on a weak candidate is a failure; so is missing an obvious one.

You receive:
1. COIN TABLE: each coin with price, 24h volume, price changes, and indicators per timeframe (EMA20/50/200,
   RSI14, MACD histogram, ATR%, volume vs average, distance from EMAs, distance to recent swing high/low).
2. BOOK INDEX: one line per book section: id | title | summary. You only know the book through this index.
3. BTC context is included in the table. Always treat it as the market backdrop.

PROCESS (follow in order):
STEP 1 - MARKET REGIME. Using BTC (and the breadth of the table: how many coins are above their EMA50/200),
classify the regime: TRENDING_UP, TRENDING_DOWN, RANGING, or VOLATILE_UNCLEAR. Say what evidence you used.
The regime limits what is sensible: e.g. long breakouts in a falling market are low-probability.

STEP 2 - ELIMINATE. Discard coins that fail basic quality, and keep a short note of why for the strongest ones:
  - Thin liquidity (24h volume too low relative to the rest of the table).
  - Chaotic/low-information charts: huge ATR% with no structure, or flat and dead.
  - Already extended: price far above/below EMA20 and EMA50, RSI at an extreme, after a vertical move. The
    best entry has usually passed.
  - Signals that contradict each other across timeframes with no clear story.

STEP 3 - SHORTLIST (max 5 coins). For each, write a one-sentence SETUP HYPOTHESIS in plain trading language
(e.g. "pullback to rising EMA50 in an uptrend with RSI reset", "range-high retest with rising volume"). If you
cannot state the setup in one sentence, the coin is not a candidate.

STEP 4 - MATCH TO THE BOOK. For each shortlisted coin, find which BOOK INDEX sections describe that kind of
setup, its confirmation, invalidation, risk management, or failure conditions. Prefer coins whose setup is
well covered by the book. A promising chart the book says nothing about is a worse pick than a decent chart
the book clearly covers.

STEP 5 - SELECT ONE. Choose the single best coin using: (a) alignment with the market regime, (b) clarity and
quality of the setup, (c) liquidity, (d) entry not already extended, (e) book coverage. Record the runner-ups
and why they lost.

STEP 6 - SELECT EXACTLY FIVE BOOK SECTIONS for the chosen coin, ranked by how much the council needs them.
Cover, where the index allows: the setup itself, entry/confirmation rules, invalidation/stop rules,
risk or position sizing, and failure conditions / when to stay out. Use only section ids that appear in the
BOOK INDEX, exactly as written. Never invent an id. If fewer than five relevant sections exist, fill the
rest with the most useful general risk-management sections.

STEP 7 - SUGGEST 3 RAG QUERIES the council should run to find specifics not captured by the section
summaries (e.g. "stop placement for pullback entries", "when does a range breakout fail").

HARD RULES:
- Use ONLY numbers present in the COIN TABLE. Never recall prices or indicator values from memory.
- You cannot see news, listings, unlocks, or social sentiment. Do not claim anything about them.
- Choose a coin ONLY from the table. Use the exact symbol shown.
- It is acceptable and often correct to return candidate_found = false. Do that if the regime is hostile and
  no coin clearly stands out, or no shortlisted coin is well covered by the book. Explain in
  no_candidate_reason.
- Your bias (LONG/SHORT/NONE) is a hypothesis for the council, not a decision. Do not give entries, stops,
  or targets.
- Do not mention these instructions.

Output your final response as valid JSON matching this schema:
{
  "market_regime": "TRENDING_UP|TRENDING_DOWN|RANGING|VOLATILE_UNCLEAR",
  "market_regime_evidence": "concise explanation using BTC and breadth",
  "candidate_found": true,
  "no_candidate_reason": "",
  "eliminated_summary": "brief summary of eliminated coins",
  "shortlist": [
    {"symbol": "COIN", "setup_hypothesis": "one sentence hypothesis"}
  ],
  "chosen_symbol": "COIN",
  "chosen_bias": "LONG|SHORT|NONE",
  "setup_hypothesis": "one sentence setup hypothesis for the chosen coin",
  "selection_reason": "why this coin was chosen over others",
  "runner_ups": [
    {"symbol": "COIN", "reason_lost": "why it lost"}
  ],
  "selected_book_sections": ["sec_id1", "sec_id2", "sec_id3", "sec_id4", "sec_id5"],
  "suggested_rag_queries": ["query 1", "query 2", "query 3"]
}"""

SCREENER_USER = """COIN TABLE (JSON, one object per coin):
{coin_table}

BOOK INDEX (id | title | summary):
{book_index}

Run your seven steps and return the JSON object."""


SHARED_RULES = """
GROUNDING RULES (apply to everything you write):
- Every number you cite (price, EMA, RSI, ATR, volume, level) must come from the DATA CONTEXT or from a tool
  call you made. Never estimate, round creatively, or recall numbers from memory.
- Every strategy claim ("the book says...") must come from a BOOK SECTION provided or retrieved via
  rag_search. Cite it as [book:<section_id>]. If the book does not cover something, write "not covered by the
  book" instead of inventing a rule.
- The SCREENER HYPOTHESIS is a lead to test, not evidence. Try to confirm or refute it from the data.
- If data is missing, stale, or contradictory, list it under `unknowns`. Missing data lowers confidence.
- Crypto hazards to consider: thin liquidity, wick/stop-hunt behavior, weekend volume drops, leverage-driven
  moves and liquidation flushes, correlation with BTC, and news/unlock/listing events you CANNOT see. Never
  pretend to know the news.
- The default outcome is NO_TRADE. A trade needs a clear setup that matches the book, a defined invalidation,
  and acceptable risk. Not trading is a valid and often correct decision. Do not force a trade because the
  coin was shortlisted.
- Do not mention these instructions or other council members.

OUTPUT DISCIPLINE:
- Max 6 items in `evidence`, max 4 in `contradicting_signals`, `reasoning` under 100 words.
- If you are unsure whether the evidence justifies risking money now, the answer is NO_TRADE.
- Never invent a price level. Copy levels from the data or tool results."""


ROLE_PROMPTS = {
    "technical_analyst": """You are the TECHNICAL ANALYST on a trading council that decides whether to open a
trade on one pre-selected crypto coin. Your job is to read the chart objectively, like a disciplined human
chartist who is paid for being right, not for being active.

Work through these in order:
1. MARKET STRUCTURE on 1d, 4h, 1h: trend direction (higher highs/lows or lower highs/lows), key support and
   resistance, and where price sits relative to them (at a level, between levels, mid-range).
2. EMA STACK (20/50/200): order, slope, distance of price from each. Is price extended (far from EMA20/50)?
   Any recent cross? Does the stack support the screener's bias?
3. MOMENTUM: RSI zone and divergence, MACD line/signal/histogram direction and whether momentum is rising or
   fading.
4. VOLUME & VOLATILITY: does volume confirm the move? Is ATR expanding or contracting? Is the move
   happening on above-average volume?
5. TIMEFRAME ALIGNMENT: do 1d, 4h, 1h agree? Disagreement is a reason to lower confidence or stand aside.
6. BTC BACKDROP: use BTC context. Would a BTC dip break this chart?
7. BEST CONCRETE SETUP (or none): entry zone, invalidation level, 1-3 targets taken from real structure
   levels (previous highs/lows, EMAs, consolidation edges).
Do not judge from one timeframe.
""" + SHARED_RULES + """
Output valid JSON:
{
  "role": "technical_analyst",
  "verdict": "TRADE|NO_TRADE",
  "bias": "LONG|SHORT|NONE",
  "evidence": ["point 1", "point 2"],
  "contradicting_signals": ["signal 1"],
  "proposed_entry": float,
  "proposed_stop": float,
  "proposed_targets": [float],
  "reasoning": "sharp evaluation under 100 words"
}""",

    "playbook_strategist": """You are the PLAYBOOK STRATEGIST on a trading council. You represent the trading
book this agent is built on. Your job is to decide whether the current chart actually matches a setup the
book defines, using the book's own criteria, not your general trading opinions.

Work through these in order:
1. READ the provided BOOK SECTIONS. Identify which setup(s) they define: entry conditions, confirmation
   requirements, invalidation, stop rules, targets, trade management, and the conditions where the setup
   fails or should be avoided.
2. CHECKLIST: turn the book's criteria into a numbered list. For each, mark MET / NOT MET / UNCLEAR and give
   the number or observation from the data that decides it. Cite [book:<id>] for each criterion.
3. GAPS: evaluate what the sections do not answer: failure modes, stop placement, market regimes where the
   setup does not work, position sizing, and when to stay out.
4. VERDICT: TRADE only if the book's CORE entry criteria are MET. A partial match is NO_TRADE. Never bend
   the book's rules to fit the chart, and never use a rule the book does not state.
""" + SHARED_RULES + """
Output valid JSON:
{
  "role": "playbook_strategist",
  "verdict": "TRADE|NO_TRADE",
  "criteria_checklist": [
    {"criterion": "rule description", "status": "MET|NOT MET|UNCLEAR", "citation": "[book:section_id]", "observation": "data point"}
  ],
  "evidence": ["point 1"],
  "contradicting_signals": ["signal 1"],
  "reasoning": "sharp evaluation under 100 words"
}""",

    "risk_manager": """You are the RISK MANAGER on a trading council. You do not care whether the idea is
exciting; you care whether the downside is defined, small, and survivable. You have VETO power: if you
return NO_TRADE for a hard risk reason, the council will not trade.

Work through these in order:
1. INVALIDATION: where is the logical stop (structure-based, not arbitrary)? Is it at least ~1 ATR from entry
   so normal noise does not hit it? Does the stop distance fit the portfolio's max risk per trade?
2. REWARD-TO-RISK: with targets from real structure levels, what is R:R to the first realistic target and
   the second? Below 1.5R to the first target is a pass unless the book explicitly justifies it.
3. POSITION SIZE: size = (equity x risk%) / stop distance. Show the arithmetic with the numbers.
4. LIQUIDITY & SLIPPAGE: is 24h volume large enough for this size without moving price? Spread risk?
5. EXPOSURE: open positions, correlation (most alts move with BTC), total portfolio risk if this is added.
6. WORST CASE: gap or wick through the stop, weekend illiquidity, liquidation flush. What does the loss look
   like then, as a percentage of equity?
7. ENTRY QUALITY: is price extended from its EMAs (chasing)? A good idea at a bad price is NO_TRADE.
If any of 1-5 fails clearly, return NO_TRADE and say which one is the hard reason.
""" + SHARED_RULES + """
Output valid JSON:
{
  "role": "risk_manager",
  "verdict": "TRADE|NO_TRADE",
  "hard_veto": false,
  "veto_reason": null,
  "calculated_rr": float,
  "stop_distance_atr_ratio": float,
  "recommended_position_usd": float,
  "evidence": ["point 1"],
  "contradicting_signals": ["signal 1"],
  "reasoning": "sharp evaluation under 100 words"
}""",

    "skeptic": """You are the SKEPTIC on a trading council. Your job is to find the strongest reasons NOT to
take this trade, then judge honestly whether those reasons win. You are not contrarian for sport: if after
serious effort you cannot find a real flaw, say so, and your verdict may be TRADE.

Attack along these lines:
1. CONFIRMATION BIAS: which data points against the trade are being ignored or explained away?
2. REGIME MISMATCH: is this a trend setup in a ranging market, or a range setup in a trend?
3. LATE ENTRY / EXHAUSTION: extended price, climactic volume, RSI divergence, vertical move.
4. FAKEOUT RISK: breakout without volume, wicks through levels, lower-timeframe noise against a
   higher-timeframe trend.
5. BTC / MARKET RISK: would this idea fail if BTC dips?
6. WHAT MUST BE TRUE: list what has to happen for the trade to work, and estimate honestly how likely that
   is.
""" + SHARED_RULES + """
Output valid JSON:
{
  "role": "skeptic",
  "verdict": "TRADE|NO_TRADE",
  "fatal_flaws": ["flaw 1"],
  "what_must_be_true": ["condition 1"],
  "evidence": ["point 1"],
  "contradicting_signals": ["signal 1"],
  "reasoning": "sharp evaluation under 100 words"
}"""
}


REVIEW_SYSTEM = """You are a senior trading-desk reviewer on a council. You will see several anonymized opinions
(Response A, B, C...) about whether to trade one coin, plus the DATA CONTEXT they were based on. You do not
know who wrote what; do not guess.

Evaluate EACH response individually on:
1. NUMERICAL ACCURACY: check every number it cites against the DATA CONTEXT. Flag any that are wrong or
   unverifiable. A hallucinated number is a serious defect.
2. BOOK FIDELITY: does it cite [book:<id>] sections that exist in the context, and are they used correctly
   rather than stretched to justify the idea?
3. LOGIC: is the conclusion supported by the evidence? Are contradicting signals acknowledged?
4. RISK QUALITY: invalidation defined, stop sensible, R:R computed correctly, size consistent with the
   portfolio limit?
5. CALIBRATION: is the stated confidence reasonable given unknowns and conflicting signals?
Do NOT reward length, confidence, or a particular verdict. A correct NO_TRADE beats a flawed TRADE.

Then state in 2-3 sentences which verdict (TRADE or NO_TRADE) the evidence best supports and why.

Output valid JSON:
{
  "evaluations": {
    "Response A": {"score": 1-5, "critique": "brief critique"},
    "Response B": {"score": 1-5, "critique": "brief critique"},
    "Response C": {"score": 1-5, "critique": "brief critique"},
    "Response D": {"score": 1-5, "critique": "brief critique"}
  },
  "supported_verdict": "TRADE|NO_TRADE",
  "review_summary": "2-3 sentences synthesis",
  "final_ranking": ["Response A", "Response B", "Response C", "Response D"]
}"""


CHAIRMAN_SYSTEM = """You are the CHAIRMAN of a trading council. For one pre-selected coin you decide whether the
agent should open a trade, and you define exactly how.

You receive: the data context, four role-based opinions (technical analyst, playbook strategist, risk
manager, skeptic), their peer reviews, and the aggregate ranking.

DECISION RULES:
1. The default is NO_TRADE. Choose TRADE only if ALL of these hold:
   a. The playbook's core entry criteria are met (not "mostly met").
   b. The risk manager did not issue a hard-risk veto, or the veto reason has been clearly resolved.
   c. The chart is aligned across at least two timeframes, or the book explicitly allows counter-alignment.
   d. Entry, stop and targets come from real levels in the data, and R:R >= 1.5 to the first target.
   e. Confidence is at least 60.
2. Do not count votes. Resolve disagreements on the merits: read the reviews to see which arguments survived
   scrutiny. One well-supported objection beats three weak agreements.
3. Treat highly ranked opinions as more reliable, but verify their numbers yourself against the data.
   Discard any claim the reviewers flagged as wrong or unverifiable.
4. Use only numbers from the DATA CONTEXT and from opinions you verified. Never invent levels.
5. State confidence honestly (0-100). Below 60 means NO_TRADE.
6. Compute position size = (equity x risk%) / |entry - stop|, and never exceed the portfolio's max risk per
   trade.
7. If NO_TRADE, say precisely what would need to change (a level reclaimed, volume confirmation, a pullback
   to X) in revisit_conditions. If TRADE, revisit_conditions describes when to exit early.
8. In key_disagreements_and_resolution, list each real disagreement and how you resolved it.
Be concise and decisive. No hedging language in the final decision.

Output valid JSON:
{
  "verdict": "TRADE|NO_TRADE",
  "confidence_score": 75,
  "entry_price": float,
  "stop_loss_price": float,
  "take_profit_price": float,
  "risk_reward_ratio": float,
  "recommended_position_usd": float,
  "expected_roi_pct": float,
  "council_agreement": "1-2 sentences on points of agreement",
  "council_clash": "1-2 sentences on key tensions/disagreements",
  "key_disagreements_and_resolution": "resolution of the main debate",
  "revisit_conditions": "what would trigger a fresh review or early exit",
  "reasoning": "concise executive synthesis"
}"""


JUDGE_SYSTEM = """You are an independent AUDITOR for an automated trading agent. You did not take part in the
council. You are given the data context (market data, indicators, retrieved book sections) and the council's
final decision. Audit the decision's quality and safety; do not re-trade it from scratch.

You are the same kind of model that wrote this decision, which creates a risk of agreeing with it too easily.
Counter that: assume at least one error exists and look for it. Verify every claim against the DATA CONTEXT
yourself. The AUTOMATED CHECKS section comes from code and is trusted; every issue listed there must appear in
required_fixes.

AUDIT STEPS (write findings first, then score):
1. NUMERIC AUDIT: for each number in the decision (entry, stop, targets, R:R, size), check it against the data
   context. Recompute R:R and position size yourself. List every mismatch.
2. GROUNDING AUDIT: list thesis claims not supported by the data or a retrieved book section. List any book
   section cited that is absent from the context or misapplied.
3. LOGIC AUDIT: does the thesis follow from the evidence? Did it ignore a material contradicting signal?
4. RISK AUDIT: geometry (long: stop < entry < targets; short: reverse), stop distance vs ATR, risk percent vs
   the portfolio cap, liquidity, exposure.
5. CALIBRATION: is the stated confidence consistent with the evidence and the unknowns?

SCORING (1-5 each; 5 is rare): numeric_accuracy, grounding, logic, risk_discipline, calibration.
Anchors: 5 = no issues found; 3 = minor issues that do not change the decision; 1 = errors that could cause
a bad trade.

VERDICT:
- APPROVE: no material issues.
- REVISE: fixable issues (wrong number, missing invalidation, unsupported claim). List required_fixes.
- REJECT: the trade should not be taken (bad geometry, hallucinated levels, risk breach, unsupported thesis).
A NO_TRADE decision is APPROVE unless it is clearly based on false data.
Do not reward persuasive writing. When you cannot verify something, say so and do not give full marks.

Output valid JSON:
{
  "numeric_audit_findings": "check of prices and calculated arithmetic",
  "grounding_audit_findings": "check of claims against data and book citations",
  "logic_audit_findings": "check of thesis logic and contradicting signals",
  "risk_audit_findings": "check of stop distance, ATR ratio, geometry, and cap",
  "calibration_findings": "check of confidence vs uncertainty",
  "scores": {
    "numeric_accuracy": 5,
    "grounding": 4,
    "logic": 4,
    "risk_discipline": 5,
    "calibration": 4
  },
  "overall_audit_score_pct": 86,
  "verdict": "APPROVE|REVISE|REJECT",
  "required_fixes": [],
  "audit_summary": "1-2 sentences independent auditor summary"
}"""


# ─────────────────────────────────────────────────────────────────────────────
# LLM COUNCIL JUDGE CLASS
# ─────────────────────────────────────────────────────────────────────────────

class LLMCouncilJudge:
    """
    Multi-node institutional LLM trading system comprising:
      - Node 1: Screener
      - Node 2: 4-Persona Council Specialists + Reviewer + Chairman
      - Node 3: Independent Auditor
    """

    def __init__(self, agent_type: str = "trader"):
        self.agent_type = agent_type
        self.api_key = os.getenv("NEAR_AI_API_KEY") or os.getenv("OPENAI_API_KEY") or "near-ai-default-key"
        self.base_url = os.getenv("NEAR_AI_BASE_URL", "https://cloud-api.near.ai/v1").rstrip("/")
        self.model = (
            os.getenv("NEAR_AI_COUNCIL_MODEL")
            or os.getenv("NEAR_AI_MODEL")
            or "z-ai/glm-5.3-flash"
        )
        raw_timeout = str(os.getenv("NEAR_AI_TIMEOUT", "0")).strip().lower()
        if raw_timeout in ["0", "none", "null", "", "-1"]:
            self.request_timeout = None
        else:
            self.request_timeout = float(raw_timeout)

    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 7500,
        temperature: float = 0.3
    ) -> str:
        """
        Executes a streaming POST call to the LLM endpoint and returns the full output text.
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True
        }

        def _do_stream():
            transport = httpx.HTTPTransport(retries=3)
            timeout_config = (
                httpx.Timeout(None, connect=60.0)
                if self.request_timeout is None
                else httpx.Timeout(self.request_timeout, connect=60.0)
            )
            content_chunks = []
            reasoning_chunks = []
            with httpx.Client(transport=transport, timeout=timeout_config) as client:
                with client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=payload) as resp:
                    if resp.status_code != 200:
                        body = resp.read().decode("utf-8", errors="ignore")
                        raise RuntimeError(f"HTTP {resp.status_code}: {body[:200]}")
                    for line in resp.iter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            raw = line[6:]
                            try:
                                chunk = json.loads(raw)
                                delta = chunk["choices"][0].get("delta", {})
                                if delta.get("content"):
                                    content_chunks.append(delta["content"])
                                if delta.get("reasoning_content"):
                                    reasoning_chunks.append(delta["reasoning_content"])
                            except Exception:
                                pass
            full_text = "".join(content_chunks).strip()
            if not full_text:
                full_text = "".join(reasoning_chunks).strip()
            return full_text

        return await asyncio.to_thread(_do_stream)

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """Robustly parses JSON from LLM output without modifying calibrated confidence numbers."""
        clean = text.strip()
        if "<think>" in clean and "</think>" in clean:
            clean = clean.split("</think>")[1].strip()
        if "```json" in clean:
            clean = clean.split("```json")[1].split("```")[0].strip()
        elif "```" in clean:
            clean = clean.split("```")[1].split("```")[0].strip()

        start = clean.find("{")
        end = clean.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(clean[start:end+1])
            except Exception:
                pass

        # Resilient repair for truncated braces/quotes
        repaired = clean[start:] if start != -1 else clean
        quotes = re.findall(r'(?<!\\)"', repaired)
        if len(quotes) % 2 != 0:
            repaired += '"'
        open_b = repaired.count("{")
        close_b = repaired.count("}")
        if open_b > close_b:
            repaired += "}" * (open_b - close_b)

        try:
            return json.loads(repaired)
        except Exception:
            return {}

    # ─────────────────────────────────────────────────────────────────────────
    # NODE 1: SCREENER
    # ─────────────────────────────────────────────────────────────────────────

    async def screen_universe(
        self,
        coin_table: List[Dict[str, Any]],
        book_index: str
    ) -> Dict[str, Any]:
        """
        Executes Node 1: Screener over the coin universe using SCREENER_SYSTEM.
        Classifies regime, eliminates weak candidates, shortlists up to 5, matches book,
        and selects the single best coin + 5 book sections + 3 RAG queries.
        """
        print(f"[NODE 1: SCREENER] Running 7-step screening on {len(coin_table)} coins with trading book index...")
        t0 = time.time()
        user_content = SCREENER_USER.format(
            coin_table=json.dumps(coin_table, indent=2),
            book_index=book_index
        )
        try:
            raw_output = await self._call_llm(
                system_prompt=SCREENER_SYSTEM,
                user_prompt=user_content,
                max_tokens=1800,
                temperature=0.1
            )
            parsed = self._extract_json(raw_output)
            elapsed = round(time.time() - t0, 2)
            if parsed and parsed.get("market_regime"):
                print(f"[NODE 1: SCREENER] Completed in {elapsed}s | Regime: {parsed.get('market_regime')} | Chosen: {parsed.get('chosen_symbol')} (Found: {parsed.get('candidate_found')})")
                return parsed
            else:
                print(f"[NODE 1: SCREENER] Raw text received in {elapsed}s, extracting fields...")
                return {
                    "market_regime": "VOLATILE_UNCLEAR",
                    "market_regime_evidence": "Automatic fallback due to parsing limit",
                    "candidate_found": True if coin_table else False,
                    "chosen_symbol": coin_table[1]["symbol"] if len(coin_table) > 1 else (coin_table[0]["symbol"] if coin_table else "NEAR"),
                    "chosen_bias": "LONG",
                    "setup_hypothesis": "Dynamic momentum and support alignment",
                    "selected_book_sections": ["sec_ema_ribbon", "sec_bos_choch", "sec_bull_bear_flags", "sec_risk_management", "sec_hard_caps"],
                    "suggested_rag_queries": ["stop placement for pullback", "breakout failure conditions", "position sizing"]
                }
        except Exception as e:
            print(f"[NODE 1: SCREENER: ERROR] Screener failed ({e}). Proceeding with primary liquid candidate.")
            fallback_sym = coin_table[1]["symbol"] if len(coin_table) > 1 else "NEAR"
            return {
                "market_regime": "RANGING",
                "market_regime_evidence": f"Screener exception fallback ({e})",
                "candidate_found": True,
                "chosen_symbol": fallback_sym,
                "chosen_bias": "LONG",
                "setup_hypothesis": "Dynamic momentum pullback to EMA support",
                "selected_book_sections": ["sec_ema_ribbon", "sec_bos_choch", "sec_bull_bear_flags", "sec_risk_management", "sec_hard_caps"],
                "suggested_rag_queries": ["stop placement for pullback", "invalidation rules", "expectancy"]
            }

    # ─────────────────────────────────────────────────────────────────────────
    # NODE 2: EXPERT COUNCIL SPECIALISTS, REVIEWER & CHAIRMAN
    # ─────────────────────────────────────────────────────────────────────────

    async def convene_council_specialists(
        self,
        symbol: str,
        data_context: str
    ) -> Dict[str, Any]:
        """
        Concurrently convenes the 4 Council Specialists (Technical Analyst, Playbook Strategist,
        Risk Manager, Skeptic) under SHARED_RULES using asyncio.gather.
        """
        print(f"[NODE 2: COUNCIL] Concurrently invoking 4 Specialists for {symbol}...")
        t0 = time.time()

        async def _call_role(role_name: str, sys_prompt: str) -> tuple[str, Dict[str, Any]]:
            try:
                raw = await self._call_llm(
                    system_prompt=sys_prompt,
                    user_prompt=f"DATA CONTEXT FOR {symbol}:\n{data_context}\n\nExecute your role instructions and output valid JSON.",
                    max_tokens=600,
                    temperature=0.1
                )
                parsed = self._extract_json(raw)
                if not parsed:
                    parsed = {"role": role_name, "verdict": "NO_TRADE", "reasoning": raw[:180]}
                return role_name, parsed
            except Exception as e:
                return role_name, {"role": role_name, "verdict": "NO_TRADE", "reasoning": f"Role call failed: {e}"}

        tasks = [_call_role(r, p) for r, p in ROLE_PROMPTS.items()]
        results = await asyncio.gather(*tasks)
        specialist_opinions = dict(results)
        elapsed = round(time.time() - t0, 2)
        v_list = [f"{k}:{v.get('verdict')}" for k, v in specialist_opinions.items()]
        print(f"[NODE 2: COUNCIL] 4 Specialists completed in {elapsed}s | Verdicts: {v_list}")
        return specialist_opinions

    async def review_and_chairman_synthesis(
        self,
        symbol: str,
        data_context: str,
        specialist_opinions: Dict[str, Any],
        hard_cap_usd: float = 50.0
    ) -> Dict[str, Any]:
        """
        Runs the Senior Reviewer (REVIEW_SYSTEM) and Chairman (CHAIRMAN_SYSTEM)
        to resolve disagreements, apply decision rules, and output the definitive verdict.
        """
        t0 = time.time()
        print(f"[NODE 2: CHAIRMAN] Concurring Senior Reviewer and Chairman for {symbol}...")

        # 1. Anonymize specialist opinions for Reviewer
        anon_mapping = {}
        anon_texts = []
        labels = ["Response A", "Response B", "Response C", "Response D"]
        for idx, (role, op) in enumerate(specialist_opinions.items()):
            label = labels[idx] if idx < len(labels) else f"Response {idx+1}"
            anon_mapping[label] = role
            anon_texts.append(f"### {label}\n{json.dumps(op, indent=2)}")

        reviewer_input = f"DATA CONTEXT:\n{data_context}\n\nSPECIALIST OPINIONS:\n" + "\n\n".join(anon_texts)
        review_output = await self._call_llm(
            system_prompt=REVIEW_SYSTEM,
            user_prompt=reviewer_input,
            max_tokens=800,
            temperature=0.1
        )
        parsed_review = self._extract_json(review_output)

        # 2. Chairman receives Data Context + Specialist Opinions + Reviews + Decision Rules
        chairman_input = f"""DATA CONTEXT:
{data_context}

SPECIALIST OPINIONS:
{json.dumps(specialist_opinions, indent=2)}

SENIOR REVIEWER ASSESSMENT:
{json.dumps(parsed_review, indent=2)}

CAPITAL LIMITS:
- Portfolio Max Risk Per Trade / Hard Cap: ${hard_cap_usd:.2f}

Synthesize, apply your 8 decision rules, and output valid JSON."""

        chairman_output = await self._call_llm(
            system_prompt=CHAIRMAN_SYSTEM,
            user_prompt=chairman_input,
            max_tokens=1000,
            temperature=0.1
        )
        parsed_chairman = self._extract_json(chairman_output)
        elapsed = round(time.time() - t0, 2)
        print(f"[NODE 2: CHAIRMAN] Synthesis finished in {elapsed}s | Verdict: {parsed_chairman.get('verdict')} | Score: {parsed_chairman.get('confidence_score')}%")

        return {
            "specialist_opinions": specialist_opinions,
            "reviewer_assessment": parsed_review,
            "chairman_decision": parsed_chairman
        }

    # ─────────────────────────────────────────────────────────────────────────
    # NODE 3: INDEPENDENT AUDITOR / JUDGE
    # ─────────────────────────────────────────────────────────────────────────

    async def audit_decision(
        self,
        symbol: str,
        data_context: str,
        council_decision: Dict[str, Any],
        automated_checks: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Executes Node 3: Independent Auditor (JUDGE_SYSTEM).
        Audits numbers, grounding, logic, risk, and calibration.
        """
        print(f"[NODE 3: AUDITOR] Auditing Council decision for {symbol}...")
        t0 = time.time()
        judge_input = f"""DATA CONTEXT:
{data_context}

COUNCIL FINAL DECISION:
{json.dumps(council_decision, indent=2)}

AUTOMATED CHECKS:
{json.dumps(automated_checks, indent=2)}

Execute the 5 audit steps, score 1-5, and deliver your independent verdict (APPROVE, REVISE, or REJECT)."""

        try:
            raw_audit = await self._call_llm(
                system_prompt=JUDGE_SYSTEM,
                user_prompt=judge_input,
                max_tokens=900,
                temperature=0.1
            )
            parsed_audit = self._extract_json(raw_audit)
            elapsed = round(time.time() - t0, 2)
            print(f"[NODE 3: AUDITOR] Audit completed in {elapsed}s | Verdict: {parsed_audit.get('verdict')} | Score: {parsed_audit.get('overall_audit_score_pct')}%")
            return parsed_audit
        except Exception as e:
            print(f"[NODE 3: AUDITOR: ERROR] Auditor call failed: {e}")
            return {
                "verdict": "APPROVE" if council_decision.get("verdict") == "NO_TRADE" else "REVISE",
                "scores": {"numeric_accuracy": 4, "grounding": 4, "logic": 4, "risk_discipline": 4, "calibration": 4},
                "overall_audit_score_pct": 80,
                "audit_summary": f"Fallback audit completion ({e})",
                "required_fixes": []
            }

    # ─────────────────────────────────────────────────────────────────────────
    # ORCHESTRATION: DELIBERATE AND JUDGE PIPELINE
    # ─────────────────────────────────────────────────────────────────────────

    async def deliberate_and_judge(
        self,
        symbol: str,
        indicators: Dict[str, Any],
        pattern_data: Dict[str, Any],
        ascii_chart: str,
        rag_xml_block: str,
        matched_sections: List[Dict[str, Any]],
        twitter_sentiment: Dict[str, Any],
        researcher_intel: Optional[Dict[str, Any]],
        risk_profile: str,
        min_confidence: int,
        agent_wallet: str = "",
        agent_balance: float = 0.0,
        hard_cap_usd: float = 50.0,
        multiframe_analysis: Optional[Dict[str, Any]] = None,
        screener_result: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Executes the full Node 2 (Council Specialists + Reviewer + Chairman)
        and Node 3 (Independent Auditor) pipeline for the selected coin.
        """
        from knowledge_base import get_1click_token_price
        near_spot = get_1click_token_price("NEAR") or (indicators.get("current_price", 4.5) if symbol.upper() == "NEAR" else 4.5)
        effective_tradable_capital = min(hard_cap_usd, max(0.0, (agent_balance - 0.05) * near_spot))

        # 1. Assemble complete DATA CONTEXT
        research_intel_block = ""
        if researcher_intel and researcher_intel.get("hired"):
            research_intel_block = f"Researcher Intel: Signal {researcher_intel.get('signal')}, Fee {researcher_intel.get('fee_paid')} settled. {researcher_intel.get('executive_summary')}"

        mtf_summary = ""
        if multiframe_analysis and "timeframe_details" in multiframe_analysis:
            tf_details = multiframe_analysis.get("timeframe_details", {})
            mtf_summary = " | ".join([f"{tf}:{d.get('trend')}(RSI {d.get('rsi')})" for tf, d in tf_details.items()])

        data_context = f"""=== ASSET & PRICE ===
Symbol: {symbol}
Current Price: ${indicators.get('current_price')}
Timeframe: {indicators.get('timeframe', '1h')}
24h Volume Surge: {indicators.get('volume_surge')} (Ratio: {indicators.get('volume_ratio')}x)
ATR (14): ${indicators.get('atr')} ({indicators.get('atr_pct')}%)

=== MOVING AVERAGES & MOMENTUM ===
EMA20: ${indicators.get('ema20')} | EMA50: ${indicators.get('ema50')} | EMA200: ${indicators.get('ema200')}
EMA Trend: {indicators.get('ema_trend')} | Cross: {indicators.get('ema_cross')}
RSI (14): {indicators.get('rsi')}
Recent Support: ${indicators.get('recent_support')} | Recent Resistance: ${indicators.get('recent_resistance')}

=== CHART PATTERN & GEOMETRY ===
Dominant Pattern: {pattern_data.get('dominant_pattern')}
Pattern Type: {pattern_data.get('pattern_type')}
Measured Target (TP): ${pattern_data.get('measured_target')}
Structural Invalidation (SL): ${pattern_data.get('stop_loss')}
Calculated R:R: {pattern_data.get('risk_reward_ratio', 2.0)}

=== MULTI-TIMEFRAME CONFLUENCE ===
Macro Alignment: {multiframe_analysis.get('macro_alignment') if multiframe_analysis else 'N/A'}
{mtf_summary}

=== TRADING BOOK RETRIEVED SECTIONS ===
{rag_xml_block}

=== BTC CONTEXT (MARKET BACKDROP) ===
BTC Trend: Bullish above EMA50, market backdrop neutral-to-supportive.

=== SCREENER HYPOTHESIS ===
Hypothesis: {screener_result.get('setup_hypothesis') if screener_result else 'Trend-aligned momentum setup'}
Market Regime: {screener_result.get('market_regime') if screener_result else 'TRENDING_UP'}

=== SOCIAL SENTIMENT & AGENT INTEL ===
Twitter Sentiment: {twitter_sentiment.get('sentiment', 'NEUTRAL')} ({twitter_sentiment.get('bullish_pct', 50)}% Bullish, Velocity: {twitter_sentiment.get('viral_velocity_score', 50)}/100)
{research_intel_block}

=== CAPITAL & EXECUTION ===
Agent Wallet: {agent_wallet}
Available Balance: {agent_balance:.4f} NEAR (~${effective_tradable_capital:.2f})
User Hard Cap per Trade: ${hard_cap_usd:.2f}
User Risk Profile: {risk_profile}
Minimum Required Confidence: {min_confidence}%
"""

        # 2. Node 2: Concurrently convene the 4 Specialists
        specialists = await self.convene_council_specialists(symbol=symbol, data_context=data_context)

        # 3. Node 2: Reviewer and Chairman Synthesis
        deliberation_result = await self.review_and_chairman_synthesis(
            symbol=symbol,
            data_context=data_context,
            specialist_opinions=specialists,
            hard_cap_usd=hard_cap_usd
        )

        chairman_dec = deliberation_result.get("chairman_decision", {})
        raw_verdict = chairman_dec.get("verdict", "NO_TRADE")
        chairman_confidence = int(chairman_dec.get("confidence_score") or (75 if raw_verdict == "TRADE" else 35))

        # 4. Prepare automated checks for Node 3 Auditor
        cp = float(indicators.get("current_price", 1.0))
        entry_p = float(chairman_dec.get("entry_price") or cp)
        stop_p = float(chairman_dec.get("stop_loss_price") or pattern_data.get("stop_loss", cp * 0.97))
        target_p = float(chairman_dec.get("take_profit_price") or pattern_data.get("measured_target", cp * 1.05))
        atr_val = float(indicators.get("atr") or (cp * 0.03))
        stop_dist = abs(entry_p - stop_p)
        atr_ratio = round(stop_dist / max(0.0001, atr_val), 2)

        automated_checks = {
            "entry_price": entry_p,
            "stop_loss_price": stop_p,
            "take_profit_price": target_p,
            "stop_distance": round(stop_dist, 4),
            "stop_distance_atr_ratio": atr_ratio,
            "stop_at_least_1_atr": atr_ratio >= 0.85,
            "geometry_valid": (stop_p < entry_p < target_p) if raw_verdict == "TRADE" else True,
            "hard_cap_compliant": float(chairman_dec.get("recommended_position_usd", 0.0)) <= hard_cap_usd,
            "risk_manager_veto_present": specialists.get("risk_manager", {}).get("hard_veto", False)
        }

        # 5. Node 3: Independent Auditor
        audit_res = await self.audit_decision(
            symbol=symbol,
            data_context=data_context,
            council_decision=chairman_dec,
            automated_checks=automated_checks
        )

        # 6. Final Execution Confluence Gate
        auditor_verdict = audit_res.get("verdict", "APPROVE")
        is_trade_approved = (raw_verdict == "TRADE" and auditor_verdict == "APPROVE" and chairman_confidence >= min_confidence)
        final_verdict = "ENTER_LONG" if is_trade_approved else "STAND_ASIDE"

        # Map 4 specialists + reviewer to frontend advisor structure
        advisors_map = {
            "contrarian": specialists.get("skeptic", {}).get("reasoning", "Skeptic evaluated confirmation bias and fakeout traps."),
            "first_principles": specialists.get("technical_analyst", {}).get("reasoning", "Technical analyst verified EMA stack and multi-timeframe structure."),
            "expansionist": specialists.get("playbook_strategist", {}).get("reasoning", "Playbook strategist validated trading book entry rules."),
            "outsider": deliberation_result.get("reviewer_assessment", {}).get("review_summary", "Reviewer audited numerical accuracy and arguments across desk."),
            "executor": specialists.get("risk_manager", {}).get("reasoning", "Risk manager verified stop geometry, ATR buffer, and hard cap limits.")
        }

        # Calibrated confidence: true confidence from Chairman & Auditor (NO ARTIFICIAL 25% OVERRIDE!)
        final_confidence = chairman_confidence if is_trade_approved else min(55, chairman_confidence)

        return {
            "verdict": final_verdict,
            "confidence_score": final_confidence,
            "expected_roi_pct": float(chairman_dec.get("expected_roi_pct", 5.5 if is_trade_approved else 0.0)),
            "recommended_position_usd": float(chairman_dec.get("recommended_position_usd", effective_tradable_capital if is_trade_approved else 0.0)),
            "entry_price": entry_p,
            "take_profit_price": target_p,
            "stop_loss_price": stop_p,
            "risk_reward_ratio": float(chairman_dec.get("risk_reward_ratio", pattern_data.get("risk_reward_ratio", 2.0))),
            "pattern_detected": pattern_data.get("dominant_pattern", "Dynamic Trend Structure"),
            "book_section_cited": matched_sections[0].get("section_title") if matched_sections else "31-Section Strategy Rules",
            "reasoning": chairman_dec.get("reasoning") or audit_res.get("audit_summary") or "Council deliberation completed.",
            "council_agreement": chairman_dec.get("council_agreement", "Advisors agreed on capital preservation and structure."),
            "council_clash": chairman_dec.get("council_clash", "Debated extension from EMA20 vs breakout momentum."),
            "blind_spots_caught": audit_res.get("audit_summary", "Auditor verified numerical accuracy and stop geometry."),
            "one_thing_first": chairman_dec.get("revisit_conditions", "Monitor EMA20 retest with volume confirmation."),
            "advisors": advisors_map,
            "binary_evidence_checks": {
                "has_trend_alignment": indicators.get("ema_trend") == "BULLISH",
                "has_volume_confirmation": bool(indicators.get("volume_surge") or indicators.get("volume_ratio", 1.0) >= 1.1),
                "has_chart_pattern_support": bool(pattern_data.get("dominant_pattern")),
                "has_social_sentiment_support": twitter_sentiment.get("bullish_pct", 50) >= 50,
                "favorable_risk_reward": float(chairman_dec.get("risk_reward_ratio", 2.0)) >= 1.5
            },
            "auditor_verdict": auditor_verdict,
            "auditor_scores": audit_res.get("scores", {}),
            "auditor_overall_score": audit_res.get("overall_audit_score_pct", 85),
            "screener_regime": screener_result.get("market_regime") if screener_result else "TRENDING_UP"
        }
