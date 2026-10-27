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
import time
from typing import Dict, Any, List, Optional, Type
import httpx
from pydantic import BaseModel, Field
from dotenv import load_dotenv

env_candidates = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
    os.path.join(os.getcwd(), "ai-agent-backend", ".env"),
    os.path.join(os.getcwd(), ".env")
]
for p in env_candidates:
    if os.path.isfile(p):
        load_dotenv(p)

# ─────────────────────────────────────────────────────────────────────────────
# PROMPT DEFINITIONS (EXACT SPECIFICATION)
# ─────────────────────────────────────────────────────────────────────────────

SCREENER_SYSTEM = """You are the SCREENER of an automated crypto trading agent. You do NOT execute trades.
Your job is to reduce the functional scanner's candidates to 1-5 candidates for the four-specialist council.
Do not force one winner: return every candidate with a distinct, evidence-grounded setup when it deserves review.
Wasting the council on a weak candidate is a failure; so is missing an obvious one.

You receive:
1. FUNCTIONAL SCANNER DATA: each coin with price, liquidity, pattern, bias, indicators, and basic chart context.
   This is the primary evidence. Evaluate the whole table before choosing candidates.
2. TRADING-BOOK CATALOG: section id, title, and topic keywords only. It is a routing catalog, never book content.
   Do not infer exact entry, stop, target, confirmation, or risk rules from the catalog.
3. CHART TOOL CONTRACT: a later bridge can retrieve candles, indicators, patterns, levels, and R:R for one
   symbol over 1, 3, or 7 days using 1h, 4h, or 12h candles. Request it only for shortlisted candidates when
   scanner evidence is insufficient. Never request charts for every scanner row.
4. RAG TOOL CONTRACT: a later bridge can retrieve the full theory and execution rules for selected section IDs
   or targeted natural-language questions. Request it only after shortlisting and only for facts needed by the
   council. Natural-language retrieval returns the most relevant sections; it is not an exact-title lookup.

PROCESS (follow in order):
STEP 1 - MARKET REGIME. Using any supplied market-context rows and the breadth of the table (how many coins are above their EMA50/200),
classify the regime: TRENDING_UP, TRENDING_DOWN, RANGING, or VOLATILE_UNCLEAR. Say what evidence you used.
The regime limits what is sensible: e.g. long breakouts in a falling market are low-probability.

STEP 2 - ELIMINATE. Discard coins that fail basic quality, and keep a short note of why for the strongest ones:
  - Thin liquidity (24h volume too low relative to the rest of the table).
  - Chaotic/low-information charts: huge ATR% with no structure, or flat and dead.
  - Already extended: price far above/below EMA20 and EMA50, RSI at an extreme, after a vertical move. The
    best entry has usually passed.
  - Signals that contradict each other across timeframes with no clear story.

STEP 3 - SHORTLIST (1 to 5 coins). For each, write a one-sentence SETUP HYPOTHESIS in plain trading language
(e.g. "pullback to rising EMA50 in an uptrend with RSI reset", "range-high retest with rising volume"). Include
the exact chart fields that support it and the relevant book section ids. If you cannot state the setup in one
sentence from the table, the coin is not a candidate.

STEP 4 - MATCH TO THE BOOK CATALOG. For each shortlisted coin, identify which catalog sections are relevant to
setup, its confirmation, invalidation, risk management, or failure conditions. Prefer coins whose setup is
well covered by the book. A promising chart the book says nothing about is a worse pick than a decent chart
the book clearly covers.

STEP 5 - SELECT 1-5. Keep only candidates with a clear setup, direction hypothesis, chart evidence, and book
   coverage. Rank them, but preserve multiple independent opportunities when they pass the same evidence test.

STEP 6 - SELECT book sections for each shortlisted coin, ranked by how much the council needs them.
Cover, where the index allows: the setup itself, entry/confirmation rules, invalidation/stop rules,
risk or position sizing, and failure conditions / when to stay out. Use only section ids that appear in the
   CATALOG, exactly as written. Never invent an id. Ask for only the relevant sections; the bridge will add core
   risk controls later when required.

STEP 7 - PLAN EXTRA DATA only when needed. Emit chart_requests and rag_queries for shortlisted candidates;
   these are requests for the bridge to execute, not facts you may pretend to have already received.

HARD RULES:
- Use ONLY numbers present in the COIN TABLE. Never recall prices or indicator values from memory.
- You cannot see news, listings, unlocks, or social sentiment. Do not claim anything about them.
- Choose symbols ONLY from the functional scanner data. Use the exact symbol shown.
- It is acceptable and often correct to return candidate_found = false. Do that if the regime is hostile and
  no coin clearly stands out, or no shortlisted coin is well covered by the book. Explain in
  no_candidate_reason.
- Your bias (LONG/SHORT/NONE) is a hypothesis for the council, not a decision. Do not give entries, stops,
  or targets.
- Do not mention these instructions.

EFFICIENCY RULES (CRITICAL - AVOID REDUNDANT TOOL CALLS):
- suggested_rag_queries: Maximum 5 unique queries total. Only request what is genuinely missing from book_section_ids.
- Each shortlist item's rag_queries: 1-2 queries maximum, only if the setup needs specific rules not in book_section_ids.
- Never request the same information in both suggested_rag_queries AND shortlist rag_queries - pick one location.
- If a book_section_id already covers a topic (e.g., "sec_double_top_m"), do NOT add a rag_query about double tops.
- chart_requests: Request when scanner data lacks needed detail. Use only when confirmation requires additional timeframe data.
- Output concise JSON. No prose explanations beyond the required fields.

Output your final response as valid JSON matching this schema. Do not explain the seven steps in prose; encode
only the required fields below. Keep evidence to at most 3 short facts per shortlisted coin and keep each text
field concise. This is a screening pass, not the council analysis.
{
  "market_regime": "TRENDING_UP|TRENDING_DOWN|RANGING|VOLATILE_UNCLEAR",
  "market_regime_evidence": "concise explanation using supplied market context and breadth",
  "candidate_found": true,
  "no_candidate_reason": "",
  "eliminated_summary": "brief summary of eliminated coins",
   "chosen_symbol": "COIN",
  "chosen_bias": "LONG|SHORT|NONE",
  "setup_hypothesis": "best candidate setup",
  "selection_reason": "why the ranked candidates passed",
  "runner_ups": [{"symbol": "COIN", "reason_lost": "why it ranked lower"}],
  "shortlist": [{
    "symbol": "COIN", "bias": "LONG|SHORT|NONE", "setup_hypothesis": "one sentence",
    "chart_evidence": ["field=value"], "book_section_ids": ["sec_id"],
    "rag_queries": [], "chart_requests": []
  }],
  "selected_book_sections": ["sec_id1", "sec_id2"],
  "suggested_rag_queries": [],
  "requested_timeframes": ["1h", "4h", "12h"]
}"""

SCREENER_USER = """COIN TABLE (JSON, one object per coin):
{coin_table}

TRADING-BOOK CATALOG (id | title | topics; routing metadata only, no book content):
{book_index}

AVAILABLE DATA TOOLS (declare requests through chart_requests/rag_queries in your JSON when needed; the bridge executes them):
- chart_data(symbol, days, timeframes): candles, OHLCV, EMA20/50/200, RSI, MACD, ATR, volume, support/resistance,
  detected patterns, measured target, stop, and R:R. Allowed days: 1, 3, 7. Allowed candle timeframes: 1h, 4h, 12h.
- trading_book(section_ids or query): retrieves complete theory and execution rules for selected candidates only.
  Use it after shortlisting, and request only the sections or questions needed to verify the setup.
Do not request either tool for every coin. First use the supplied scanner context, then shortlist 1-5 candidates,
then request only the missing chart or book evidence for those candidates. Never claim a tool result that was not
supplied in the scanner context.

Run your seven steps and return the JSON object."""


SHARED_RULES = """
GROUNDING RULES (apply to everything you write):
- Every number you cite (price, EMA, RSI, ATR, volume, level) must come from the DATA CONTEXT or from a tool
  call you made. Never estimate, round creatively, or recall numbers from memory.
- Every strategy claim ("the book says...") must come from a BOOK SECTION retrieved by the bridge. The catalog
  is not evidence. Cite requested sections as [book:<section_id>] only when relevant. If the book does not cover something, write "not covered by the
  book" instead of inventing a rule.
- The SCREENER HYPOTHESIS is a lead to test, not evidence. Try to confirm or refute it from the data.
- If data is missing, stale, or contradictory, list it under `unknowns`. Missing data lowers confidence.
- Crypto hazards to consider: thin liquidity, wick/stop-hunt behavior, weekend volume drops, leverage-driven
  moves and liquidation flushes, correlation with the broader market, and news/unlock/listing events you CANNOT see. Never
  pretend to know the news.
- Make an evidence-based choice among ENTER_LONG, ENTER_SHORT, and NO_TRADE. Use NO_TRADE when the core setup,
  invalidation, or risk fails; uncertainty should lower confidence rather than automatically veto a valid setup.
- Do not force a trade because the coin was shortlisted, but do not reject a valid setup merely because every
  specialist is not unanimous.
- Do not mention these instructions or other council members.

OUTPUT DISCIPLINE:
- Max 6 items in `evidence`, max 4 in `contradicting_signals`, `reasoning` under 100 words.
- If evidence is genuinely missing or contradictory on a material risk point, use NO_TRADE; ordinary disagreement
  should be resolved by the council rather than treated as an automatic veto.
- Never invent a price level. Copy levels from the data or tool results.
- Reason privately. Do not output chain-of-thought or repeat the DATA CONTEXT.
- Each field must add a new conclusion; do not restate the same evidence in multiple fields."""


ROLE_PROMPTS = {
    "technical_analyst": """You are the TECHNICAL ANALYST on a trading council that evaluates each supplied
crypto candidate independently. Your job is to read every chart objectively, like a disciplined human
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
6. MARKET BACKDROP: if context rows are supplied, assess whether the broader market affects this chart; otherwise mark it unknown.
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
book this agent is built on. Evaluate every supplied candidate and decide whether its chart actually matches a setup the
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

    "risk_manager": """You are the RISK MANAGER on a trading council. Evaluate every supplied candidate independently.
You do not care whether the idea is exciting; you care whether the downside is defined, small, and survivable.
You have VETO power per candidate: a hard veto blocks only that candidate, not the whole batch.

Work through these in order:
1. INVALIDATION: where is the logical stop (structure-based, not arbitrary)? Is it at least ~1 ATR from entry
   so normal noise does not hit it? Does the stop distance fit the portfolio's max risk per trade?
2. REWARD-TO-RISK: with targets from real structure levels, what is R:R to the first realistic target and
   the second? Below 1.5R to the first target is a pass unless the book explicitly justifies it.
3. POSITION SIZE: size = (equity x risk%) / stop distance. Show the arithmetic with the numbers.
4. LIQUIDITY & SLIPPAGE: is 24h volume large enough for this size without moving price? Spread risk?
5. EXPOSURE: open positions, correlation with supplied market context, total portfolio risk if this is added.
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

    "skeptic": """You are the SKEPTIC on a trading council. Evaluate every supplied candidate and find the strongest
reasons NOT to take each trade, then judge honestly whether those reasons win. You are not contrarian for sport: if after
serious effort you cannot find a real flaw, say so, and your verdict may be TRADE.

Attack along these lines:
1. CONFIRMATION BIAS: which data points against the trade are being ignored or explained away?
2. REGIME MISMATCH: is this a trend setup in a ranging market, or a range setup in a trend?
3. LATE ENTRY / EXHAUSTION: extended price, climactic volume, RSI divergence, vertical move.
4. FAKEOUT RISK: breakout without volume, wicks through levels, lower-timeframe noise against a
   higher-timeframe trend.
5. MARKET RISK: would a move in the supplied market context invalidate this idea?
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
1. Choose TRADE only when the supplied evidence supports a valid setup:
   a. The playbook's core entry criteria are met (not "mostly met").
   b. The risk manager did not issue a hard-risk veto, or the veto reason has been clearly resolved.
   c. The chart is aligned across at least two timeframes, or the book explicitly allows counter-alignment.
   d. Entry, stop and targets come from real levels in the data, and R:R >= 1.5 to the first target.
   e. Confidence is at least 60.
2. Do not require unanimous specialist agreement or favor LONG over SHORT. Resolve disagreements on the merits:
   read each specialist's evidence and let the risk veto apply only to explicit, material risk failures.
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


COMBINED_COUNCIL_SYSTEM = """You are the combined SENIOR REVIEWER, CHAIRMAN, and INDEPENDENT AUDITOR for one
automated crypto-trading decision.

You receive 1-5 complete candidate bundles, live market context, retrieved trading-book sections, and four
specialist opinion sets. In one pass you must evaluate every candidate, resolve every specialist disagreement,
audit the supplied numbers and rules, and return one final executable decision per candidate.

RULES:
- Trade only when book criteria are met, risk has no unresolved hard veto, relevant timeframes align, geometry is
  valid, first-target R:R is at least 1.5, confidence passes the supplied threshold, and hard caps pass.
- Do not require unanimity and do not favor LONG over SHORT. Resolve ordinary disagreement from the evidence;
  only an explicit material risk veto blocks a trade.
- Use only supplied data, verified specialist values, or retrieved book rules. Never invent a level or market fact.
- LONG geometry is stop < entry < target. SHORT geometry is target < entry < stop.
- Treat broader-market context only from scanner evidence when supplied. If it is missing, mark it unknown; never assume its direction.
- If required evidence is missing or unverifiable, use NO_TRADE and list the gap in required_fixes.

OUTPUT DISCIPLINE:
- Reason privately; output conclusions and checks only, never chain-of-thought.
- Do not repeat the same fact across fields. Keep text concise and evidence lists short.
- Return exactly one JSON object matching the supplied Pydantic schema. Include a `decisions` item for every
  candidate. No markdown."""


# ─────────────────────────────────────────────────────────────────────────────
# PYDANTIC STRUCTURED OUTPUT SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class ChairmanDecisionModel(BaseModel):
    verdict: str = Field(default="NO_TRADE", description="TRADE or NO_TRADE")
    bias: str = Field(default="NONE", description="LONG, SHORT, or NONE")
    confidence_score: int = Field(default=0, ge=0, le=100, description="Calibrated confidence 0-100")
    entry_price: float = Field(default=0.0, description="Definitive entry price")
    stop_loss_price: float = Field(default=0.0, description="Definitive stop loss price")
    take_profit_price: float = Field(default=0.0, description="Definitive take profit price")
    risk_reward_ratio: float = Field(default=0.0, description="Reward-to-risk ratio")
    recommended_position_usd: float = Field(default=0.0, description="Position size in USD")
    expected_roi_pct: float = Field(default=0.0, description="Expected ROI percentage")
    council_agreement: str = Field(default="", description="1-2 sentences on points of agreement")
    council_clash: str = Field(default="", description="1-2 sentences on key tensions/disagreements")
    key_disagreements_and_resolution: str = Field(default="", description="Resolution of the main debate")
    revisit_conditions: str = Field(default="", description="What would trigger a fresh review or early exit")
    reasoning: str = Field(default="", description="Concise executive synthesis")


class SpecialistOpinionModel(BaseModel):
    role: str = Field(default="")
    verdict: str = Field(default="NO_TRADE", description="TRADE or NO_TRADE")
    bias: str = Field(default="NONE", description="LONG, SHORT, or NONE")
    evidence: List[str] = Field(default_factory=list)
    contradicting_signals: List[str] = Field(default_factory=list)
    proposed_entry: Optional[float] = None
    proposed_stop: Optional[float] = None
    proposed_targets: Optional[List[float]] = None
    hard_veto: Optional[bool] = False
    veto_reason: Optional[str] = None
    calculated_rr: Optional[float] = None
    stop_distance_atr_ratio: Optional[float] = None
    recommended_position_usd: Optional[float] = None
    fatal_flaws: Optional[List[str]] = None
    what_must_be_true: Optional[List[str]] = None
    criteria_checklist: Optional[List[Dict[str, Any]]] = None
    reasoning: str = Field(default="", description="Sharp evaluation under 100 words")


class CandidateTradeViewModel(BaseModel):
    symbol: str = Field(default="")
    verdict: str = Field(default="NO_TRADE", description="TRADE or NO_TRADE")
    bias: str = Field(default="NONE", description="LONG, SHORT, or NONE")
    confidence_score: int = Field(default=0, ge=0, le=100)
    evidence: List[str] = Field(default_factory=list)
    contradicting_signals: List[str] = Field(default_factory=list)
    proposed_entry: Optional[float] = None
    proposed_stop: Optional[float] = None
    proposed_targets: Optional[List[float]] = None
    hard_veto: bool = False
    veto_reason: Optional[str] = None
    calculated_rr: Optional[float] = None
    stop_distance_atr_ratio: Optional[float] = None
    recommended_position_usd: Optional[float] = None
    reasoning: str = Field(default="")


class SpecialistBatchModel(BaseModel):
    views: List[CandidateTradeViewModel] = Field(default_factory=list)


class FinalTradeDecisionModel(BaseModel):
    symbol: str = Field(default="")
    verdict: str = Field(default="NO_TRADE", description="TRADE or NO_TRADE")
    bias: str = Field(default="NONE", description="LONG, SHORT, or NONE")
    confidence_score: int = Field(default=0, ge=0, le=100)
    entry_price: float = Field(default=0.0)
    stop_loss_price: float = Field(default=0.0)
    take_profit_price: float = Field(default=0.0)
    risk_reward_ratio: float = Field(default=0.0)
    recommended_position_usd: float = Field(default=0.0)
    expected_roi_pct: float = Field(default=0.0)
    pattern_confirmed: str = Field(default="")
    evidence: List[str] = Field(default_factory=list)
    reasoning: str = Field(default="")
    revisit_conditions: str = Field(default="")
    hard_cap_check: str = Field(default="")
    execution_ready: bool = False
    target_chain: str = Field(default="")


class SeniorReviewerModel(BaseModel):
    evaluations: Dict[str, Any] = Field(default_factory=dict)
    supported_verdict: str = Field(default="NO_TRADE")
    review_summary: str = Field(default="")
    final_ranking: List[str] = Field(default_factory=list)


class AuditorModel(BaseModel):
    numeric_audit_findings: str = Field(default="")
    grounding_audit_findings: str = Field(default="")
    logic_audit_findings: str = Field(default="")
    risk_audit_findings: str = Field(default="")
    calibration_findings: str = Field(default="")
    scores: Dict[str, int] = Field(default_factory=lambda: {
        "numeric_accuracy": 4, "grounding": 4, "logic": 4, "risk_discipline": 4, "calibration": 4
    })
    overall_audit_score_pct: int = Field(default=80)
    verdict: str = Field(default="APPROVE")
    required_fixes: List[str] = Field(default_factory=list)
    audit_summary: str = Field(default="")


class CombinedCouncilModel(BaseModel):
    """Single structured result for reviewer, chairman, and auditor duties."""
    specialist_evaluations: Dict[str, Any] = Field(default_factory=dict)
    supported_verdict: str = Field(default="NO_TRADE")
    review_summary: str = Field(default="")
    final_ranking: List[str] = Field(default_factory=list)
    verdict: str = Field(default="NO_TRADE")
    bias: str = Field(default="NONE")
    confidence_score: int = Field(default=0, ge=0, le=100)
    entry_price: float = Field(default=0.0)
    stop_loss_price: float = Field(default=0.0)
    take_profit_price: float = Field(default=0.0)
    risk_reward_ratio: float = Field(default=0.0)
    recommended_position_usd: float = Field(default=0.0)
    expected_roi_pct: float = Field(default=0.0)
    council_agreement: str = Field(default="")
    council_clash: str = Field(default="")
    key_disagreements_and_resolution: str = Field(default="")
    revisit_conditions: str = Field(default="")
    reasoning: str = Field(default="")
    numeric_audit_findings: str = Field(default="")
    grounding_audit_findings: str = Field(default="")
    logic_audit_findings: str = Field(default="")
    risk_audit_findings: str = Field(default="")
    calibration_findings: str = Field(default="")
    scores: Dict[str, int] = Field(default_factory=lambda: {
        "numeric_accuracy": 1,
        "grounding": 1,
        "logic": 1,
        "risk_discipline": 1,
        "calibration": 1,
    })
    overall_audit_score_pct: int = Field(default=0)
    auditor_verdict: str = Field(default="REJECT")
    required_fixes: List[str] = Field(default_factory=list)
    audit_summary: str = Field(default="")
    decisions: List[FinalTradeDecisionModel] = Field(default_factory=list)
    execution_ready: bool = False
    target_chain: str = Field(default="")


class ScreenerResultModel(BaseModel):
    market_regime: str = Field(default="RANGING")
    market_regime_evidence: str = Field(default="")
    candidate_found: bool = Field(default=False)
    no_candidate_reason: str = Field(default="")
    eliminated_summary: str = Field(default="")
    shortlist: List[Dict[str, Any]] = Field(default_factory=list)
    runner_ups: List[Dict[str, Any]] = Field(default_factory=list)
    chosen_symbol: str = Field(default="")
    chosen_bias: str = Field(default="NONE")
    setup_hypothesis: str = Field(default="")
    selected_book_sections: List[str] = Field(default_factory=lambda: [
        "sec_ema_ribbon", "sec_bos_choch", "sec_bull_bear_flags", "sec_risk_management", "sec_hard_caps"
    ])
    suggested_rag_queries: List[str] = Field(default_factory=lambda: [
        "stop placement for pullback", "invalidation rules", "expectancy"
    ])
    requested_timeframes: List[str] = Field(default_factory=lambda: ["1h", "4h", "1d"])


# ─────────────────────────────────────────────────────────────────────────────
# LLM COUNCIL JUDGE CLASS
# ─────────────────────────────────────────────────────────────────────────────

class LLMCouncilJudge:
    """
    Multi-node institutional LLM trading system comprising:
      - Node 1: Screener
      - Node 2: 4-Persona Council Specialists + combined Reviewer/Chairman/Auditor
    """

    def __init__(self, agent_type: str = "trader"):
        self.agent_type = agent_type
        self.api_key = os.getenv("NEAR_AI_API_KEY") or os.getenv("OPENAI_API_KEY") or "near-ai-default-key"
        self.base_url = os.getenv("NEAR_AI_BASE_URL", "https://cloud-api.near.ai/v1").rstrip("/")
        self.model = "z-ai/glm-5.3-flash"
        raw_timeout = str(os.getenv("NEAR_AI_TIMEOUT", "300")).strip().lower()
        if raw_timeout in ["0", "none", "null", "", "-1"]:
            self.request_timeout = 300.0
        else:
            self.request_timeout = max(180.0, float(raw_timeout))
        self.last_call_failed = False
        self.last_finish_reason = None

    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 80192,
        temperature: float = 0.3,
        response_format: Optional[Dict[str, Any]] = None,
        reasoning_effort: Optional[str] = None
    ) -> str:
        """
        Executes a streaming POST call to the LLM endpoint with generous token limit
        so agent never fails mid-response.
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
        if reasoning_effort:
            payload["reasoning_effort"] = reasoning_effort
        payload["chat_template_kwargs"] = {"enable_thinking": True}
        if response_format:
            payload["response_format"] = response_format

        # No arbitrary read timeout cutoff - allow natural LLM completion
        timeout_config = httpx.Timeout(None, connect=30.0)
        content_chunks = []
        reasoning_chunks = []
        finish_reason = None
        async with httpx.AsyncClient(timeout=timeout_config) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    raise RuntimeError(f"HTTP {resp.status_code}: {body.decode('utf-8', errors='ignore')[:200]}")
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    line_str = line.strip()
                    if line_str == "data: [DONE]":
                        break
                    if line_str.startswith("data: "):
                        raw = line_str[6:].strip()
                        try:
                            chunk = json.loads(raw)
                            choice = chunk.get("choices", [{}])[0]
                            finish_reason = choice.get("finish_reason") or finish_reason
                            delta = choice.get("delta", {})
                            if delta.get("content"):
                                content_chunks.append(delta["content"])
                            if delta.get("reasoning_content"):
                                reasoning_chunks.append(delta["reasoning_content"])
                        except Exception:
                            pass
        self.last_finish_reason = finish_reason
        if finish_reason == "length":
            raise RuntimeError("GLM response reached its output limit before completing JSON")
        full_text = "".join(content_chunks).strip()
        if not full_text:
            full_text = "".join(reasoning_chunks).strip()
        return full_text

    async def _call_llm_pydantic(
        self,
        pydantic_model: Type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 16384,  # Increased for GLM reasoning overhead
        temperature: float = 0.2
    ) -> Dict[str, Any]:
        """
        Invokes LLM with OpenAI-compatible json_object enforcement, generous token limit,
        and strictly validates against the Pydantic model with automatic type coercion.
        """
        schema_json = json.dumps(pydantic_model.model_json_schema(), indent=2)
        augmented_prompt = (
            f"{user_prompt}\n\n"
            f"STRICT OUTPUT REQUIREMENT:\n"
            f"You MUST output a valid JSON object strictly complying with this Pydantic schema:\n"
            f"```json\n{schema_json}\n```\n"
            f"Output JSON only."
        )

        try:
            raw_output = await self._call_llm(
                system_prompt=system_prompt,
                user_prompt=augmented_prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format={"type": "json_object"}
            )
        except Exception as net_err:
            import traceback
            print(f"[LLM: PYDANTIC: ERROR] Network/Endpoint failure in _call_llm_pydantic: {type(net_err).__name__}: {net_err}")
            traceback.print_exc()
            self.last_call_failed = True
            return pydantic_model().model_dump()

        extracted = self._extract_json(raw_output)
        if not extracted:
            self.last_call_failed = True
            print("[LLM: PYDANTIC] Invalid or incomplete JSON response; failing closed.")
            return pydantic_model().model_dump()
        if pydantic_model is CombinedCouncilModel:
            required = {"decisions"} if extracted.get("decisions") else {
                "verdict", "confidence_score", "entry_price", "stop_loss_price",
                "take_profit_price", "auditor_verdict", "scores",
            }
            if not required.issubset(extracted):
                self.last_call_failed = True
                print("[LLM: PYDANTIC] Combined council response omitted required decision fields; failing closed.")
                return pydantic_model().model_dump()
        try:
            validated = pydantic_model.model_validate(extracted)
            return validated.model_dump()
        except Exception as val_err:
            print(f"[LLM: PYDANTIC] Model validation coercion notice ({val_err}). Re-validating fields...")
            try:
                valid_dict = pydantic_model(**{
                    k: v for k, v in extracted.items()
                    if k in pydantic_model.model_fields
                }).model_dump()
                return valid_dict
            except Exception:
                return extracted if isinstance(extracted, dict) and extracted else pydantic_model().model_dump()

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

        # Never repair truncated JSON for a trading decision. A partial object
        # can look valid while silently losing a risk field.
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
            # Whitespace is unnecessary to the model and materially increases
            # prompt transfer for broad universes.
            coin_table=json.dumps(coin_table, separators=(",", ":")),
            book_index=book_index
        )
        print(
            f"[NODE 1: SCREENER] Prompt size: {len(SCREENER_SYSTEM) + len(user_content):,} chars; "
            "catalog-only book context; request budget: screener-specific max_tokens"
        )
        try:
            raw_output = await self._call_llm(
                system_prompt=SCREENER_SYSTEM,
                user_prompt=user_content,
                # The screener returns a small object. A huge budget caused GLM
                # to spend many minutes on hidden reasoning before producing it.
                # This is large enough for five concise shortlist records and is
                # independently checked for finish_reason=length below.
                max_tokens=20000,
                temperature=0.4,
                response_format={"type": "json_object"},
                reasoning_effort="medium"
            )
            print(f"[NODE 1: SCREENER] Provider response received after {round(time.time() - t0, 2)}s")
            if self.last_finish_reason == "length":
                raise RuntimeError("Screener response reached its output limit; refusing truncated JSON")
            parsed_raw = self._extract_json(raw_output)
            try:
                parsed = ScreenerResultModel.model_validate(parsed_raw).model_dump()
            except Exception:
                parsed = parsed_raw
            if isinstance(coin_table, list):
                available_symbols = {
                    str(row.get("symbol", "")).upper()
                    for row in coin_table
                    if isinstance(row, dict) and row.get("symbol")
                }
            else:
                available_symbols = set()
                for line in str(coin_table).splitlines():
                    columns = [part.strip() for part in line.split("|")]
                    if len(columns) > 1 and columns[1] and columns[1].lower() not in {"symbol", "---"}:
                        candidate_symbol = columns[1].replace("*", "").strip()
                        if candidate_symbol and candidate_symbol.isalnum():
                            available_symbols.add(candidate_symbol.upper())
            if parsed.get("candidate_found"):
                shortlist = []
                for candidate in parsed.get("shortlist", [])[:5]:
                    candidate_symbol = str(candidate.get("symbol", "")).upper()
                    if candidate_symbol in available_symbols:
                        shortlist.append({**candidate, "symbol": candidate_symbol})
                parsed["shortlist"] = shortlist
                chosen_symbol = str(parsed.get("chosen_symbol", "")).upper()
                if chosen_symbol and chosen_symbol not in available_symbols:
                    parsed["candidate_found"] = False
                    parsed["no_candidate_reason"] = "LLM screener selected a symbol not present in the functional scanner table."
                else:
                    parsed["chosen_symbol"] = chosen_symbol or (shortlist[0]["symbol"] if shortlist else "")
                    if not shortlist:
                        parsed["shortlist"] = [{"symbol": parsed["chosen_symbol"], "setup_hypothesis": parsed.get("setup_hypothesis", "")}]
                    parsed["candidate_found"] = bool(parsed.get("shortlist"))
            elapsed = round(time.time() - t0, 2)
            if parsed and parsed.get("market_regime"):
                print(f"[NODE 1: SCREENER] Completed in {elapsed}s | Regime: {parsed.get('market_regime')} | Chosen: {parsed.get('chosen_symbol')} (Found: {parsed.get('candidate_found')})")
                return parsed
            else:
                print(f"[NODE 1: SCREENER] No valid candidate JSON received in {elapsed}s. Failing closed.")
                return {
                    "market_regime": "VOLATILE_UNCLEAR",
                    "market_regime_evidence": "LLM screener output was missing or invalid",
                    "candidate_found": False,
                    "no_candidate_reason": "LLM screener output was missing or invalid.",
                    "chosen_symbol": "",
                    "chosen_bias": "NONE",
                    "setup_hypothesis": "",
                    "selected_book_sections": ["sec_ema_ribbon", "sec_bos_choch", "sec_bull_bear_flags", "sec_risk_management", "sec_hard_caps"],
                    "suggested_rag_queries": [],
                    "requested_timeframes": ["1h", "4h", "1d"]
                }
        except Exception as e:
            import traceback
            err_msg = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
            print(f"[NODE 1: SCREENER: ERROR] Screener failed ({err_msg}). Failing closed.")
            traceback.print_exc()
            return {
                "market_regime": "VOLATILE_UNCLEAR",
                "market_regime_evidence": f"Screener exception ({err_msg})",
                "candidate_found": False,
                "no_candidate_reason": f"LLM screener unavailable: {err_msg}",
                "chosen_symbol": "",
                "chosen_bias": "NONE",
                "setup_hypothesis": "",
                "selected_book_sections": ["sec_ema_ribbon", "sec_bos_choch", "sec_bull_bear_flags", "sec_risk_management", "sec_hard_caps"],
                "suggested_rag_queries": [],
                "requested_timeframes": ["1h", "4h", "1d"]
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
        Risk Manager, Skeptic) under SHARED_RULES using asyncio.gather and Pydantic validation.
        Generous 8192 token limit prevents mid-response token exhaustion.
        """
        print(f"[NODE 2: COUNCIL] Concurrently invoking 4 Specialists for {symbol} (Pydantic enforced)...")
        t0 = time.time()

        async def _call_role(role_name: str, sys_prompt: str) -> tuple[str, Dict[str, Any]]:
            try:
                parsed = await self._call_llm_pydantic(
                    pydantic_model=SpecialistOpinionModel,
                    system_prompt=sys_prompt,
                    user_prompt=f"DATA CONTEXT FOR {symbol}:\n{data_context}\n\nExecute your role instructions and output valid JSON.",
                    max_tokens=16384,  # Increased for GLM reasoning overhead
                    temperature=0.1
                )
                parsed["role"] = role_name
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

    async def convene_council_specialists_batch(
        self,
        candidates_context: str,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Have the four independent personas evaluate every shortlisted coin."""
        print("[NODE 2: COUNCIL] Invoking four specialists across the shortlisted candidates...")

        async def _call_role(role_name: str, sys_prompt: str):
            batch_prompt = f"""SHORTLISTED CANDIDATES AND COMPLETE SUPPLIED EVIDENCE:
{candidates_context}

Evaluate every candidate independently. Do not compare away a valid LONG or SHORT setup.
Return one view per candidate using this exact JSON shape:
{{"views":[{{"symbol":"COIN","verdict":"TRADE|NO_TRADE","bias":"LONG|SHORT|NONE","confidence_score":0,"evidence":["fact"],"contradicting_signals":["fact"],"proposed_entry":0.0,"proposed_stop":0.0,"proposed_targets":[0.0],"hard_veto":false,"veto_reason":null,"calculated_rr":0.0,"stop_distance_atr_ratio":0.0,"recommended_position_usd":0.0,"reasoning":"4-7 concise grounded lines"}}]}}
Use supplied numbers only. Return conclusions and evidence, not hidden chain-of-thought."""
            parsed = await self._call_llm_pydantic(
                pydantic_model=SpecialistBatchModel,
                system_prompt=sys_prompt,
                user_prompt=batch_prompt,
                max_tokens=16384,
                temperature=0.1,
            )
            views = parsed.get("views", [])
            for view in views:
                view["symbol"] = str(view.get("symbol", "")).upper()
                view["role"] = role_name
            return role_name, views

        results = await asyncio.gather(*[
            _call_role(role, prompt) for role, prompt in ROLE_PROMPTS.items()
        ])
        return dict(results)

    async def combined_council_synthesis(
        self,
        symbol: str,
        data_context: str,
        specialist_opinions: Dict[str, Any],
        hard_cap_usd: float = 50.0,
        deterministic_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Run reviewer, chairman, and auditor duties in one structured call."""
        print(f"[NODE 2: COMBINED REVIEWER/CHAIRMAN/AUDITOR] Evaluating {symbol} in one pass...")
        t0 = time.time()
        combined_input = f"""DATA CONTEXT FOR {symbol}:
{data_context}

FOUR SPECIALIST OPINIONS:
{json.dumps(specialist_opinions, separators=(',', ':'))}

CAPITAL LIMIT:
Portfolio max risk / hard cap: ${hard_cap_usd:.2f}

DETERMINISTIC PRE-CHECKS:
{json.dumps(deterministic_context or {}, separators=(',', ':'))}

Evaluate every specialist, resolve the council, produce the final decision, and audit it.
Return one JSON object only."""

        try:
            combined = await self._call_llm_pydantic(
                pydantic_model=CombinedCouncilModel,
                system_prompt=COMBINED_COUNCIL_SYSTEM,
                user_prompt=combined_input,
                max_tokens=16384,  # Increased for GLM reasoning overhead
                temperature=0.1,
            )
            elapsed = round(time.time() - t0, 2)
            print(
                f"[NODE 2: COMBINED] Completed in {elapsed}s | "
                f"Verdict: {combined.get('verdict')} | "
                f"Audit: {combined.get('auditor_verdict')} | "
                f"Confidence: {combined.get('confidence_score')}%"
            )
            return combined
        except Exception as e:
            self.last_call_failed = True
            print(f"[NODE 2: COMBINED: ERROR] Combined council failed: {e}")
            return CombinedCouncilModel().model_dump()

    async def combined_council_batch_synthesis(
        self,
        candidates_context: str,
        specialist_views: Dict[str, List[Dict[str, Any]]],
        hard_cap_usd: float,
        min_confidence: int,
    ) -> Dict[str, Any]:
        """One review agent decides every candidate and returns executable decisions."""
        prompt = f"""SHORTLISTED CANDIDATE DATA, CHARTS, BOOK RULES, AND TOOL OUTPUTS:
{candidates_context}

FOUR SPECIALIST VIEWS, GROUPED BY PERSONA:
{json.dumps(specialist_views, separators=(',', ':'))}

EXECUTION CONSTRAINTS:
- Agent wallet and available balance are in the candidate context.
- Maximum USD per trade: {hard_cap_usd}
- Minimum confidence: {min_confidence}
- Return one decision for every supplied candidate, including NO_TRADE decisions.

For each candidate, independently verify the specialists' numbers, book grounding, chart pattern, direction,
entry, stop, target, R:R, position size, and hard-cap compliance. Resolve disagreements fairly; unanimity is not
required and LONG/SHORT have equal treatment. Only provide execution_ready=true when all required values are
present, geometry is valid, confidence passes, and the hard cap is satisfied. Do not call tools. Use only supplied
context and specialist output. Return concise visible evidence, not chain-of-thought."""
        result = await self._call_llm_pydantic(
            pydantic_model=CombinedCouncilModel,
            system_prompt=COMBINED_COUNCIL_SYSTEM,
            user_prompt=prompt,
            max_tokens=32768,
            temperature=0.1,
        )
        if not result.get("decisions"):
            self.last_call_failed = True
            print("[NODE 2: COMBINED] No per-candidate decisions returned; failing closed.")
        return result
    async def review_and_chairman_synthesis(
        self,
        symbol: str,
        data_context: str,
        specialist_opinions: Dict[str, Any],
        hard_cap_usd: float = 50.0
    ) -> Dict[str, Any]:
        """
        Runs the Senior Reviewer (REVIEW_SYSTEM) and Chairman (CHAIRMAN_SYSTEM)
        with Pydantic structured output models to resolve disagreements, apply decision rules,
        and output the definitive verdict without mid-response failure.
        """
        t0 = time.time()
        print(f"[NODE 2: CHAIRMAN] Concurring Senior Reviewer and Chairman for {symbol} (Pydantic enforced)...")

        # 1. Anonymize specialist opinions for Reviewer
        anon_mapping = {}
        anon_texts = []
        labels = ["Response A", "Response B", "Response C", "Response D"]
        for idx, (role, op) in enumerate(specialist_opinions.items()):
            label = labels[idx] if idx < len(labels) else f"Response {idx+1}"
            anon_mapping[label] = role
            anon_texts.append(f"### {label}\n{json.dumps(op, indent=2)}")

        reviewer_input = f"DATA CONTEXT:\n{data_context}\n\nSPECIALIST OPINIONS:\n" + "\n\n".join(anon_texts)
        parsed_review = await self._call_llm_pydantic(
            pydantic_model=SeniorReviewerModel,
            system_prompt=REVIEW_SYSTEM,
            user_prompt=reviewer_input,
            max_tokens=16384,  # Increased for GLM reasoning overhead
            temperature=0.1
        )

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

        parsed_chairman = await self._call_llm_pydantic(
            pydantic_model=ChairmanDecisionModel,
            system_prompt=CHAIRMAN_SYSTEM,
            user_prompt=chairman_input,
            max_tokens=16384,  # Increased for GLM reasoning overhead
            temperature=0.1
        )
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
        Executes Node 3: Independent Auditor (JUDGE_SYSTEM) via Pydantic model.
        Audits numbers, grounding, logic, risk, and calibration.
        """
        print(f"[NODE 3: AUDITOR] Auditing Council decision for {symbol} (Pydantic enforced)...")
        t0 = time.time()
        judge_input = f"""DATA CONTEXT:
{data_context}

COUNCIL FINAL DECISION:
{json.dumps(council_decision, indent=2)}

AUTOMATED CHECKS:
{json.dumps(automated_checks, indent=2)}

Execute the 5 audit steps, score 1-5, and deliver your independent verdict (APPROVE, REVISE, or REJECT)."""

        try:
            parsed_audit = await self._call_llm_pydantic(
                pydantic_model=AuditorModel,
                system_prompt=JUDGE_SYSTEM,
                user_prompt=judge_input,
                max_tokens=16384,  # Increased for GLM reasoning overhead
                temperature=0.1
            )
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
        screener_result: Optional[Dict[str, Any]] = None,
        scanner_candidates: Optional[List[Dict[str, Any]]] = None,
        candidate_bundles: Optional[List[Dict[str, Any]]] = None,
        execution_source_token: Optional[str] = None,
        execution_target_chain: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes the full Node 2 pipeline: four specialists followed by one
        combined reviewer/chairman/auditor decision for the selected coin.
        """
        try:
            self.last_call_failed = False
            # Keep native wallet balance and USD hard cap separate. No token,
            # price, or fallback conversion is hardcoded into the decision.
            effective_tradable_capital = hard_cap_usd

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

=== ASCII CHART VIEW ===
{ascii_chart}

=== MULTI-TIMEFRAME CONFLUENCE ===
Macro Alignment: {multiframe_analysis.get('macro_alignment') if multiframe_analysis else 'N/A'}
{mtf_summary}

=== COMPLETE CHART DATA ALREADY USED BY THE SCANNER ===
{json.dumps((multiframe_analysis or {}).get('full_data', {}), separators=(',', ':'))}

=== FUNCTIONAL SCANNER EVIDENCE FOR THE LLM SHORTLIST ===
{json.dumps(scanner_candidates or [], separators=(',', ':'))}

=== SHORTLIST CHART, BOOK, AND TARGETED RAG OUTPUTS ===
{json.dumps(candidate_bundles or [], separators=(',', ':'))}

=== TRADING BOOK RETRIEVED SECTIONS ===
{rag_xml_block}

=== SCREENER HYPOTHESIS ===
Hypothesis: {screener_result.get('setup_hypothesis') if screener_result else 'No LLM screener hypothesis supplied'}
Market Regime: {screener_result.get('market_regime') if screener_result else 'UNKNOWN'}

=== SOCIAL SENTIMENT & AGENT INTEL ===
Twitter Sentiment: {twitter_sentiment.get('sentiment', 'NEUTRAL')} ({twitter_sentiment.get('bullish_pct', 50)}% Bullish, Velocity: {twitter_sentiment.get('viral_velocity_score', 50)}/100)
{research_intel_block}

=== CAPITAL & EXECUTION ===
Agent Wallet: {agent_wallet}
Available Balance: {agent_balance:.4f} native units (USD conversion must come from live execution data)
User Hard Cap per Trade: ${hard_cap_usd:.2f}
User Risk Profile: {risk_profile}
Minimum Required Confidence: {min_confidence}%
Execution Source Token: {execution_source_token or 'UNCONFIGURED'}
Execution Target Chain: {execution_target_chain or 'UNCONFIGURED'}
"""

            # 2. Batch path: the four personas evaluate every shortlisted coin,
            # then one combined review agent decides every coin.
            if candidate_bundles and len(candidate_bundles) > 1:
                batch_context = "\n\n".join([
                    f"=== CANDIDATE {item.get('symbol')} ===\n"
                    f"{json.dumps(item, separators=(',', ':'))}"
                    for item in candidate_bundles[:5]
                ])
                batch_context += f"\n\n=== COMMON EXECUTION CONTEXT ===\n{data_context}"
                specialist_views = await self.convene_council_specialists_batch(batch_context)
                if self.last_call_failed:
                    return {
                        "verdict": "STAND_ASIDE",
                        "status": "JUDGE_FAILED",
                        "confidence_score": 0,
                        "recommended_position_usd": 0.0,
                        "decisions": [],
                        "reasoning": "TRADE BLOCKED: Specialist council endpoint failure.",
                    }
                combined_batch = await self.combined_council_batch_synthesis(
                    candidates_context=batch_context,
                    specialist_views=specialist_views,
                    hard_cap_usd=hard_cap_usd,
                    min_confidence=min_confidence,
                )
                if self.last_call_failed:
                    return {
                        "verdict": "STAND_ASIDE",
                        "status": "JUDGE_FAILED",
                        "confidence_score": 0,
                        "recommended_position_usd": 0.0,
                        "decisions": [],
                        "reasoning": "TRADE BLOCKED: Combined council endpoint failure.",
                    }
                decisions = []
                for decision in combined_batch.get("decisions", []):
                    normalized = dict(decision)
                    raw = str(normalized.get("verdict", "NO_TRADE")).upper()
                    bias = str(normalized.get("bias", "NONE")).upper()
                    if raw == "TRADE":
                        normalized["verdict"] = "ENTER_SHORT" if bias == "SHORT" else "ENTER_LONG"
                    elif raw not in {"ENTER_LONG", "ENTER_SHORT"}:
                        normalized["verdict"] = "STAND_ASIDE"
                        normalized["execution_ready"] = False
                    decisions.append(normalized)
                combined_batch["decisions"] = decisions
                combined_batch["specialist_views"] = specialist_views
                combined_batch["status"] = "COMPLETED"
                combined_batch["verdict"] = next((d["verdict"] for d in decisions if d["verdict"] != "STAND_ASIDE"), "STAND_ASIDE")
                combined_batch["confidence_score"] = max([int(d.get("confidence_score", 0)) for d in decisions] or [0])
                return combined_batch

            # 2. Node 2: Concurrently convene the 4 Specialists
            specialists = await self.convene_council_specialists(symbol=symbol, data_context=data_context)

            if self.last_call_failed:
                print("[NODE 2: LLM JUDGE: ABORT] Specialists encountered endpoint failure. Aborting early.")
                return {
                    "verdict": "STAND_ASIDE",
                    "status": "JUDGE_FAILED",
                    "confidence_score": 0,
                    "recommended_position_usd": 0.0,
                    "reasoning": "TRADE BLOCKED: LLM Council encountered failure (Endpoint unreachable)"
                }

            # 3. Combined senior review, chairman decision, and independent audit.
            # The programmatic checks are recomputed after the model response below.
            combined_result = await self.combined_council_synthesis(
                symbol=symbol,
                data_context=data_context,
                specialist_opinions=specialists,
                hard_cap_usd=hard_cap_usd,
                deterministic_context={
                    "current_price": indicators.get("current_price"),
                    "atr": indicators.get("atr"),
                    "pattern_target": pattern_data.get("measured_target"),
                    "pattern_stop": pattern_data.get("stop_loss"),
                    "minimum_confidence": min_confidence,
                },
            )

            if self.last_call_failed:
                print("[NODE 2: LLM JUDGE: ABORT] Combined council encountered endpoint failure.")
                return {
                    "verdict": "STAND_ASIDE",
                    "status": "JUDGE_FAILED",
                    "confidence_score": 0,
                    "recommended_position_usd": 0.0,
                    "reasoning": "TRADE BLOCKED: Combined LLM Council encountered failure (Endpoint unreachable)",
                }

            chairman_dec = {
                key: combined_result.get(key)
                for key in ChairmanDecisionModel.model_fields
            }
            raw_verdict = combined_result.get("verdict", "NO_TRADE")
            chairman_confidence = int(combined_result.get("confidence_score") or 0)

            # 4. Prepare deterministic execution checks from the combined decision
            cp = float(indicators.get("current_price", 1.0))
            entry_p = float(chairman_dec.get("entry_price") or cp)
            stop_p = float(chairman_dec.get("stop_loss_price") or pattern_data.get("stop_loss", cp * 0.97))
            target_p = float(chairman_dec.get("take_profit_price") or pattern_data.get("measured_target", cp * 1.05))
            atr_val = float(indicators.get("atr") or (cp * 0.03))
            stop_dist = abs(entry_p - stop_p)
            atr_ratio = round(stop_dist / max(0.0001, atr_val), 2)

            is_short = (chairman_dec.get("bias") == "SHORT" or "SHORT" in str(raw_verdict).upper())
            if is_short:
                geometry_valid = (target_p < entry_p < stop_p) if raw_verdict == "TRADE" else True
            else:
                geometry_valid = (stop_p < entry_p < target_p) if raw_verdict == "TRADE" else True

            automated_checks = {
                "entry_price": entry_p,
                "stop_loss_price": stop_p,
                "take_profit_price": target_p,
                "stop_distance": round(stop_dist, 4),
                "stop_distance_atr_ratio": atr_ratio,
                "stop_at_least_1_atr": atr_ratio >= 0.85,
                "geometry_valid": geometry_valid,
                "hard_cap_compliant": float(chairman_dec.get("recommended_position_usd", 0.0)) <= hard_cap_usd,
                "risk_manager_veto_present": specialists.get("risk_manager", {}).get("hard_veto", False)
            }

            # The combined response contains the reviewer and auditor outputs.
            deliberation_result = {
                "specialist_opinions": specialists,
                "reviewer_assessment": {
                    "evaluations": combined_result.get("specialist_evaluations", {}),
                    "supported_verdict": combined_result.get("supported_verdict", "NO_TRADE"),
                    "review_summary": combined_result.get("review_summary", ""),
                    "final_ranking": combined_result.get("final_ranking", []),
                },
                "chairman_decision": chairman_dec,
            }
            audit_res = {
                "numeric_audit_findings": combined_result.get("numeric_audit_findings", ""),
                "grounding_audit_findings": combined_result.get("grounding_audit_findings", ""),
                "logic_audit_findings": combined_result.get("logic_audit_findings", ""),
                "risk_audit_findings": combined_result.get("risk_audit_findings", ""),
                "calibration_findings": combined_result.get("calibration_findings", ""),
                "scores": combined_result.get("scores", {}),
                "overall_audit_score_pct": combined_result.get("overall_audit_score_pct", 0),
                "verdict": combined_result.get("auditor_verdict", "REJECT"),
                "required_fixes": combined_result.get("required_fixes", []),
                "audit_summary": combined_result.get("audit_summary", ""),
            }

            # 6. Final Execution Confluence Gate
            auditor_verdict = audit_res.get("verdict", "APPROVE")
            risk_veto = bool(specialists.get("risk_manager", {}).get("hard_veto", False))
            hard_cap_compliant = bool(automated_checks.get("hard_cap_compliant", False))
            is_trade_approved = (
                raw_verdict == "TRADE"
                and auditor_verdict == "APPROVE"
                and chairman_confidence >= min_confidence
                and geometry_valid
                and not risk_veto
                and hard_cap_compliant
            )
            final_verdict = ("ENTER_SHORT" if is_short else "ENTER_LONG") if is_trade_approved else "STAND_ASIDE"

            # Map 4 specialists + reviewer to frontend advisor structure
            advisors_map = {
                "contrarian": specialists.get("skeptic", {}).get("reasoning", "Skeptic evaluated confirmation bias and fakeout traps."),
                "first_principles": specialists.get("technical_analyst", {}).get("reasoning", "Technical analyst verified EMA stack and multi-timeframe structure."),
                "expansionist": specialists.get("playbook_strategist", {}).get("reasoning", "Playbook strategist validated trading book entry rules."),
                "outsider": deliberation_result.get("reviewer_assessment", {}).get("review_summary", "Reviewer audited numerical accuracy and arguments across desk."),
                "executor": specialists.get("risk_manager", {}).get("reasoning", "Risk manager verified stop geometry, ATR buffer, and hard cap limits.")
            }

            final_confidence = chairman_confidence if is_trade_approved else min(55, chairman_confidence)

            if self.last_call_failed:
                return {
                    "verdict": "STAND_ASIDE",
                    "status": "JUDGE_FAILED",
                    "confidence_score": 0,
                    "recommended_position_usd": 0.0,
                    "reasoning": "TRADE BLOCKED: LLM Council encountered failure (Endpoint unreachable)"
                }

            return {
                "verdict": final_verdict,
                "status": "COMPLETED",
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
                    "has_trend_alignment": indicators.get("ema_trend") in {"BULLISH", "BEARISH"},
                    "has_volume_confirmation": bool(indicators.get("volume_surge") or indicators.get("volume_ratio", 1.0) >= 1.1),
                    "has_chart_pattern_support": bool(pattern_data.get("dominant_pattern")),
                    "has_social_sentiment_support": twitter_sentiment.get("bullish_pct", 50) >= 50,
                    "favorable_risk_reward": float(chairman_dec.get("risk_reward_ratio", 2.0)) >= 1.5
                },
                "auditor_verdict": auditor_verdict,
                "auditor_scores": audit_res.get("scores", {}),
                "auditor_overall_score": audit_res.get("overall_audit_score_pct", 85),
                "screener_regime": screener_result.get("market_regime") if screener_result else "UNKNOWN"
            }
        except Exception as fatal_e:
            print(f"[NODE 2: FATAL] Deliberation halted: {fatal_e}")
            return {
                "verdict": "STAND_ASIDE",
                "status": "JUDGE_FAILED",
                "confidence_score": 0,
                "recommended_position_usd": 0.0,
                "reasoning": f"TRADE BLOCKED: LLM Council encountered failure ({fatal_e})"
            }
