"""
Neptune AI — Chart Visualizer & Multimodal Vision Engine
Generates:
  1. Matplotlib Dark-Mode Candlestick Chart PNG with:
     - Real historical candlesticks and volume profile
     - Dynamic EMA 20 (Cyan) and EMA 50 (Purple) trend ribbons
     - Key Support & Resistance Breakout/Confluence Zones
     - Pattern Geometry Overlays (Double Bottom 'W', Double Top 'M', Bull Flag, Triangles)
     - Key Trade Levels (Entry, Target TP, Invalidation SL)
     - Forward-Projecting Agent Prediction Path with Forecast Confidence Cone & Target Arrow
  2. ASCII Candlestick Visual Chart Grid for LLM Judge Ingestion (ASCII-safe for all OS terminals)
Allows both the autonomous LLM Judge and the user on the frontend to visually inspect the chart pattern.
"""

import os
import io
import base64
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional

# Matplotlib headless backend
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches
    import matplotlib.ticker as ticker
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False
    plt = None
    patches = None
    ticker = None

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    np = None

CHARTS_DIR = os.path.join(os.path.dirname(__file__), "knowledge_base", "charts")


def generate_ascii_chart(
    candles: List[Dict[str, float]],
    symbol: str,
    timeframe: str,
    pattern_name: str,
    tp_price: float,
    sl_price: float,
    height: int = 12,
    width: int = 42
) -> str:
    """
    Renders an ASCII-safe visual chart representing the price trajectory,
    recent candles, support/resistance, and TP/SL levels.
    """
    if not candles:
        return "[No candle data available for ASCII chart]"

    closes = [c["close"] for c in candles[-width:]]
    min_p = min(min(closes), sl_price * 0.99)
    max_p = max(max(closes), tp_price * 1.01)
    price_range = max(0.0001, max_p - min_p)

    lines = []
    lines.append(f"+-- [{symbol} / USDT ({timeframe}) | Pattern: {pattern_name}] " + "-" * max(1, width - 25) + "+")

    # Build ASCII grid using standard ASCII characters safe on CP1252 / Windows
    for row in range(height, -1, -1):
        price_level = min_p + (row / height) * price_range
        price_label = f"${price_level:7.4f} |" if price_level < 1.0 else f"${price_level:7.2f} |"

        row_chars = []
        for c in closes:
            val_norm = (c - min_p) / price_range
            c_row = int(val_norm * height)
            if c_row == row:
                row_chars.append("*")
            elif c_row > row:
                row_chars.append("|")
            else:
                row_chars.append(" ")

        row_str = "".join(row_chars)

        # Annotate Key Target Lines
        if abs(price_level - tp_price) / max(0.001, tp_price) < 0.025:
            row_str = row_str[: max(0, len(row_str) - 20)] + f" <-- [TARGET TP: ${tp_price:.4f}]"
        elif abs(price_level - sl_price) / max(0.001, sl_price) < 0.025:
            row_str = row_str[: max(0, len(row_str) - 20)] + f" <-- [STOP LOSS: ${sl_price:.4f}]"

        lines.append(price_label + row_str)

    lines.append("+-------+" + "-" * len(closes) + "-> (Time)  [FORECAST >> TARGET TP]")
    current = closes[-1]
    lines.append(f"  Current Price: ${current:.4f} | Target TP: ${tp_price:.4f} | Stop Loss: ${sl_price:.4f}")
    return "\n".join(lines)


def render_chart_image(
    candles: List[Dict[str, float]],
    symbol: str,
    timeframe: str,
    pattern_name: str,
    tp_price: float,
    sl_price: float,
    entry_price: float,
    verdict: str = "ENTER_LONG",
    expected_roi_pct: float = 0.0,
    confidence_score: int = 80,
    pattern_data: Optional[Dict[str, Any]] = None,
    indicators: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Renders an institutional-grade dark-mode candlestick chart with:
      - Real candlestick OHLC bars and volume sub-panel
      - EMA 20 & EMA 50 trend ribbons
      - Support & Resistance breakout zones
      - Pattern geometry lines (Double Bottom, Double Top, Bull Flag, etc.)
      - Trade execution levels (Entry, Target TP, Stop Loss)
      - Forward-projecting Agent Prediction Path & Confidence Cone extending into future bars
    """
    os.makedirs(CHARTS_DIR, exist_ok=True)
    chart_filename = f"chart_{symbol.upper()}_{timeframe}.png"
    chart_path = os.path.join(CHARTS_DIR, chart_filename)

    display_candles = candles[-38:] if len(candles) >= 38 else candles
    n = len(display_candles)
    if n == 0 or not HAS_MATPLOTLIB or plt is None:
        return {"file_path": chart_path, "filename": chart_filename, "data_uri": ""}

    future_steps = 8
    total_x = n + future_steps

    # Style: Institutional Dark Cyberpunk Theme
    fig, (ax_main, ax_vol) = plt.subplots(
        2, 1, figsize=(11.5, 6.2), dpi=120,
        facecolor="#0B0F19",
        gridspec_kw={"height_ratios": [3.6, 1.0], "hspace": 0.07}
    )
    ax_main.set_facecolor("#0B0F19")
    ax_vol.set_facecolor("#0B0F19")

    indices = np.arange(n)
    all_closes = [c["close"] for c in display_candles]
    all_highs = [c["high"] for c in display_candles]
    all_lows = [c["low"] for c in display_candles]
    current_price = all_closes[-1]

    # Calculate reasonable display width
    body_width = 0.65

    # 1. Candlestick and Volume Drawing
    for i, c in enumerate(display_candles):
        o, h, l, cl = c["open"], c["high"], c["low"], c["close"]
        color = "#10B981" if cl >= o else "#F43F5E"  # Emerald green vs Rose red

        # Candle Wick
        ax_main.plot([i, i], [l, h], color=color, linewidth=1.15, alpha=0.9)
        # Candle Body
        body_bottom = min(o, cl)
        body_height = max(0.00001, abs(cl - o))
        rect = patches.Rectangle(
            (i - (body_width / 2), body_bottom), body_width, body_height,
            facecolor=color, edgecolor=color, alpha=0.92
        )
        ax_main.add_patch(rect)

        # Volume Bar in lower panel
        vol = float(c.get("volume", 0.0))
        ax_vol.bar(i, vol, width=body_width, color=color, alpha=0.72)

    # 2. Moving Averages: EMA 20 & EMA 50
    if len(all_closes) >= 8:
        ema20 = []
        k20 = 2 / (min(20, len(all_closes)) + 1)
        prev = all_closes[0]
        for v in all_closes:
            prev = (v * k20) + (prev * (1 - k20))
            ema20.append(prev)
        ax_main.plot(indices, ema20, color="#38BDF8", linewidth=1.6, label="EMA 20 (Fast Trend)", alpha=0.9)

    if len(all_closes) >= 15:
        ema50 = []
        k50 = 2 / (min(50, len(all_closes)) + 1)
        prev = all_closes[0]
        for v in all_closes:
            prev = (v * k50) + (prev * (1 - k50))
            ema50.append(prev)
        ax_main.plot(indices, ema50, color="#A855F7", linewidth=1.6, label="EMA 50 (Macro Trend)", alpha=0.85)

    # 3. Dynamic Support & Resistance Zones
    eval_window = min(25, n)
    recent_highs = all_highs[-eval_window:]
    recent_lows = all_lows[-eval_window:]
    res_level = max(recent_highs)
    sup_level = min(recent_lows)

    # Shaded Support and Resistance Bands
    ax_main.axhspan(sup_level * 0.998, sup_level * 1.002, color="#10B981", alpha=0.10, label="Support Demand Zone")
    ax_main.axhline(sup_level, color="#10B981", linestyle=":", linewidth=1.0, alpha=0.55)

    ax_main.axhspan(res_level * 0.998, res_level * 1.002, color="#F43F5E", alpha=0.10, label="Resistance Supply Zone")
    ax_main.axhline(res_level, color="#F43F5E", linestyle=":", linewidth=1.0, alpha=0.55)

    # 4. Pattern Geometry Overlays & Structural Recognition Lines
    p_name_lower = pattern_name.lower()
    badge_color = "#10B981" if "bull" in p_name_lower or "bottom" in p_name_lower else "#F43F5E"
    
    # Visual Badge for Identified Pattern directly on chart
    ax_main.text(
        0.025, 0.93,
        f"✦ Pattern Detected: {pattern_name}",
        transform=ax_main.transAxes,
        fontsize=9.5, fontweight="bold",
        color=badge_color,
        bbox=dict(boxstyle="round,pad=0.4", facecolor="#0B0F19", edgecolor=badge_color, alpha=0.92, linewidth=1.2)
    )

    if "double bottom" in p_name_lower or "w formation" in p_name_lower:
        # Construct 'W' geometry
        t1_idx = max(1, n - 22)
        t1_p = min(all_lows[max(0, t1_idx - 2) : min(n, t1_idx + 3)])
        pk_idx = max(t1_idx + 2, n - 12)
        pk_p = max(all_highs[max(0, pk_idx - 2) : min(n, pk_idx + 3)])
        t2_idx = max(pk_idx + 2, n - 4)
        t2_p = min(all_lows[max(0, t2_idx - 2) : min(n, t2_idx + 3)])

        w_x = [t1_idx, pk_idx, t2_idx, n - 1]
        w_y = [t1_p, pk_p, t2_p, current_price]
        ax_main.plot(w_x, w_y, color="#F59E0B", linewidth=2.4, linestyle="-", label="Double Bottom 'W' Geometry", alpha=0.95)
        for px, py in zip(w_x[:-1], w_y[:-1]):
            ax_main.plot(px, py, marker="o", markersize=6.5, markerfacecolor="#FDE047", markeredgecolor="#78350F", markeredgewidth=1.4)
        ax_main.axhline(pk_p, color="#F59E0B", linestyle="--", linewidth=1.4, alpha=0.8, label=f"W Neckline: ${pk_p:.4f}")

    elif "double top" in p_name_lower or "m formation" in p_name_lower:
        # Construct 'M' geometry
        p1_idx = max(1, n - 22)
        p1_p = max(all_highs[max(0, p1_idx - 2) : min(n, p1_idx + 3)])
        tr_idx = max(p1_idx + 2, n - 12)
        tr_p = min(all_lows[max(0, tr_idx - 2) : min(n, tr_idx + 3)])
        p2_idx = max(tr_idx + 2, n - 4)
        p2_p = max(all_highs[max(0, p2_idx - 2) : min(n, p2_idx + 3)])

        m_x = [p1_idx, tr_idx, p2_idx, n - 1]
        m_y = [p1_p, tr_p, p2_p, current_price]
        ax_main.plot(m_x, m_y, color="#F43F5E", linewidth=2.4, linestyle="-", label="Double Top 'M' Geometry", alpha=0.95)
        for px, py in zip(m_x[:-1], m_y[:-1]):
            ax_main.plot(px, py, marker="o", markersize=6.5, markerfacecolor="#FB7185", markeredgecolor="#881337", markeredgewidth=1.4)
        ax_main.axhline(tr_p, color="#F43F5E", linestyle="--", linewidth=1.4, alpha=0.8, label=f"M Breakdown Line: ${tr_p:.4f}")

    elif "flag" in p_name_lower:
        # Bull/Bear Flag Channel
        flag_start = max(1, n - 14)
        fx = [flag_start, n - 1]
        fy_upper = [all_highs[flag_start], max(all_highs[-4:])]
        fy_lower = [all_lows[flag_start], min(all_lows[-4:])]
        ax_main.plot(fx, fy_upper, color="#F59E0B", linewidth=2.2, linestyle="--", label="Flag Resistance Channel", alpha=0.9)
        ax_main.plot(fx, fy_lower, color="#F59E0B", linewidth=2.2, linestyle="--", label="Flag Support Channel", alpha=0.9)
        ax_main.fill_between(fx, fy_lower, fy_upper, color="#F59E0B", alpha=0.08)

    elif "triangle" in p_name_lower:
        # Ascending / Symmetrical Triangle
        tri_start = max(1, n - 18)
        tx = [tri_start, n - 1]
        ty_res = [res_level, res_level]
        ty_sup = [all_lows[tri_start], min(all_lows[-5:])]
        ax_main.plot(tx, ty_res, color="#F59E0B", linewidth=2.2, linestyle="-", label="Triangle Resistance", alpha=0.9)
        ax_main.plot(tx, ty_sup, color="#38BDF8", linewidth=2.2, linestyle="-", label="Triangle Ascending Support", alpha=0.9)
        ax_main.fill_between(tx, ty_sup, ty_res, color="#38BDF8", alpha=0.07)

    else:
        # Dynamic Multi-Bar Trend Channel (Upper Resistance & Lower Support trendlines)
        if len(all_lows) >= 12:
            l_start = max(0, n - 16)
            tx = [l_start, n - 1]
            ty_sup = [all_lows[l_start], min(all_lows[-4:])]
            ty_res = [all_highs[l_start], max(all_highs[-4:])]
            ax_main.plot(tx, ty_sup, color="#06B6D4", linewidth=2.0, linestyle=":", label="Pattern Support Line", alpha=0.85)
            ax_main.plot(tx, ty_res, color="#F59E0B", linewidth=2.0, linestyle=":", label="Pattern Resistance Line", alpha=0.85)

    # 5. Key Trade Execution Levels (Entry, Target TP, Stop Loss)
    # Only draw active TP/SL and execution levels when a trade was actually approved!
    is_active_trade = verdict in ["ENTER_LONG", "ENTER_SHORT"] and tp_price > 0 and sl_price > 0

    if is_active_trade:
        roi_label = f" (+{expected_roi_pct:.1f}%)" if expected_roi_pct > 0 else ""
        sl_pct = abs((entry_price - sl_price) / max(0.0001, entry_price) * 100)
        ax_main.axhline(entry_price, color="#3B82F6", linestyle="-.", linewidth=1.4, label=f"Entry: ${entry_price:.4f}", alpha=0.85)
        ax_main.axhline(tp_price, color="#10B981", linestyle="--", linewidth=2.0, label=f"Target TP: ${tp_price:.4f}{roi_label}")
        ax_main.axhline(sl_price, color="#EF4444", linestyle="--", linewidth=2.0, label=f"Stop Loss: ${sl_price:.4f} (-{sl_pct:.1f}%)")
    else:
        # Trade rejected by Council / Stand-Aside: show current price only, no active TP/SL
        ax_main.axhline(current_price, color="#94A3B8", linestyle="-.", linewidth=1.4, label=f"Spot Price: ${current_price:.4f}", alpha=0.85)
        # Show rejection / stand-aside banner
        rejection_label = "COUNCIL: STAND ASIDE" if verdict in ["STAND_ASIDE", "NO_TRADE"] else "COUNCIL: RISK REJECTED"
        ax_main.text(
            1.5,
            res_level * 0.995,
            f" [ {rejection_label} — ZERO CAPITAL AT RISK ] ",
            fontsize=8.5,
            fontweight="bold",
            color="#F59E0B",
            bbox=dict(boxstyle="round,pad=0.3", facecolor="#1E1B4B", edgecolor="#F59E0B", alpha=0.9)
        )

    # 6. AGENT PREDICTION / PROJECTED TRAJECTORY PATH
    # Extend timeline into future bars
    proj_x = [n - 1, n + 1, n + 3, n + 5, n + future_steps - 1]

    if verdict == "ENTER_LONG" and tp_price > entry_price:
        # Bullish Trajectory Path: slight pullback/consolidation -> explosive impulse -> TP
        roi_label = f" (+{expected_roi_pct:.1f}%)" if expected_roi_pct > 0 else ""
        dy = tp_price - current_price
        proj_y = [
            current_price,
            current_price + dy * 0.12,
            current_price + dy * 0.42,
            current_price + dy * 0.78,
            tp_price
        ]

        # Forecast Confidence Cone
        cone_upper = [y * (1 + 0.007 * (i + 1)) for i, y in enumerate(proj_y)]
        cone_lower = [y * (1 - 0.007 * (i + 1)) for i, y in enumerate(proj_y)]
        ax_main.fill_between(proj_x, cone_lower, cone_upper, color="#38BDF8", alpha=0.12, label="Agent Forecast Cone")

        # Glowing Trajectory Path
        ax_main.plot(proj_x, proj_y, color="#38BDF8", linewidth=2.4, linestyle="--", label="Agent Predicted Path", alpha=0.95)
        for px, py in zip(proj_x[1:], proj_y[1:]):
            ax_main.plot(px, py, marker="s", markersize=5, markerfacecolor="#38BDF8", markeredgecolor="#0C4A6E", alpha=0.9)

        # Target Arrow Annotation Badge
        ax_main.annotate(
            f"Forecast Target TP\n${tp_price:.4f}{roi_label}",
            xy=(proj_x[-1], proj_y[-1]),
            xytext=(proj_x[-1] - 3.4, proj_y[-1] * 1.025),
            arrowprops=dict(facecolor="#10B981", edgecolor="#064E3B", shrink=0.08, width=1.5, headwidth=6),
            fontsize=8.5, fontweight="bold", color="#10B981",
            bbox=dict(boxstyle="round,pad=0.35", facecolor="#064E3B", edgecolor="#10B981", alpha=0.88)
        )

    elif verdict == "ENTER_SHORT" and tp_price < entry_price:
        # Bearish Trajectory Path
        roi_label = f" (+{expected_roi_pct:.1f}%)" if expected_roi_pct > 0 else ""
        dy = current_price - tp_price
        proj_y = [
            current_price,
            current_price - dy * 0.12,
            current_price - dy * 0.42,
            current_price - dy * 0.78,
            tp_price
        ]
        cone_upper = [y * (1 + 0.007 * (i + 1)) for i, y in enumerate(proj_y)]
        cone_lower = [y * (1 - 0.007 * (i + 1)) for i, y in enumerate(proj_y)]
        ax_main.fill_between(proj_x, cone_lower, cone_upper, color="#F43F5E", alpha=0.12, label="Agent Forecast Cone")

        ax_main.plot(proj_x, proj_y, color="#F43F5E", linewidth=2.4, linestyle="--", label="Agent Predicted Path", alpha=0.95)
        for px, py in zip(proj_x[1:], proj_y[1:]):
            ax_main.plot(px, py, marker="s", markersize=5, markerfacecolor="#F43F5E", markeredgecolor="#881337", alpha=0.9)

        ax_main.annotate(
            f"Forecast Short TP\n${tp_price:.4f}{roi_label}",
            xy=(proj_x[-1], proj_y[-1]),
            xytext=(proj_x[-1] - 3.4, proj_y[-1] * 0.975),
            arrowprops=dict(facecolor="#F43F5E", edgecolor="#881337", shrink=0.08, width=1.5, headwidth=6),
            fontsize=8.5, fontweight="bold", color="#F43F5E",
            bbox=dict(boxstyle="round,pad=0.35", facecolor="#881337", edgecolor="#F43F5E", alpha=0.88)
        )

    else:
        # Neutral / Stand-Aside / Capital Preservation: flat projected path
        proj_y = [current_price] * len(proj_x)
        ax_main.plot(proj_x, proj_y, color="#F59E0B", linewidth=2.0, linestyle=":", label="Stand-Aside Path (No Execution)", alpha=0.85)
        ax_main.annotate(
            "STAND ASIDE\nCapital Preserved",
            xy=(proj_x[-1], current_price),
            xytext=(proj_x[-1] - 3.2, current_price * 1.015),
            arrowprops=dict(facecolor="#F59E0B", edgecolor="#78350F", shrink=0.08, width=1.5, headwidth=5),
            fontsize=8.0, fontweight="bold", color="#F59E0B",
            bbox=dict(boxstyle="round,pad=0.3", facecolor="#78350F", edgecolor="#F59E0B", alpha=0.88)
        )

    # Vertical Forecast Separation Line
    ax_main.axvline(n - 1, color="#64748B", linestyle=":", linewidth=1.2, alpha=0.7)
    mid_y = (sup_level + res_level) / 2
    ax_main.text(n - 0.85, mid_y, "FORECAST >>", color="#94A3B8", fontsize=7.5, fontweight="bold", rotation=90)

    # 7. Axes & Layout Polish
    ax_main.set_xlim(-1, total_x)
    ax_vol.set_xlim(-1, total_x)

    ax_main.tick_params(colors="#64748B", which="both", labelsize=8)
    ax_vol.tick_params(colors="#64748B", which="both", labelsize=7)
    for spine in ax_main.spines.values():
        spine.set_color("#1E293B")
    for spine in ax_vol.spines.values():
        spine.set_color("#1E293B")
    ax_main.grid(True, color="#1E293B", linestyle=":", alpha=0.5)
    ax_vol.grid(True, color="#1E293B", linestyle=":", alpha=0.5)
    ax_vol.set_ylabel("Volume", color="#64748B", fontsize=7.5)

    # Adaptive Price Formatter on Y-Axis
    if current_price < 0.001:
        price_fmt = lambda y, _: f"${y:.6f}"
    elif current_price < 1.0:
        price_fmt = lambda y, _: f"${y:.4f}"
    else:
        price_fmt = lambda y, _: f"${y:.2f}"
    ax_main.yaxis.set_major_formatter(ticker.FuncFormatter(price_fmt))

    # Clean X-Axis Ticks (Timestamp and Future Projections)
    tick_locs = []
    tick_labels = []
    # Sample 4-5 ticks from past candles
    step = max(6, n // 5)
    for idx in range(0, n, step):
        tick_locs.append(idx)
        c_time = display_candles[idx].get("open_time")
        if c_time:
            try:
                dt = datetime.fromtimestamp(c_time / 1000.0, tz=timezone.utc)
                tick_labels.append(dt.strftime("%H:%M"))
            except Exception:
                tick_labels.append(f"-{n - idx}h")
        else:
            tick_labels.append(f"-{n - idx}h")

    # Present bar
    tick_locs.append(n - 1)
    tick_labels.append("Now")

    # Future projection milestones
    tick_locs.append(n + 3)
    tick_labels.append("+4h")
    tick_locs.append(n + future_steps - 1)
    tick_labels.append(f"+{future_steps}h (TP)")

    ax_vol.set_xticks(tick_locs)
    ax_vol.set_xticklabels(tick_labels, color="#94A3B8", fontsize=7.5)
    ax_main.set_xticklabels([])  # Hide x labels on upper main plot to avoid duplication

    # Title & Legend
    title_str = (
        f"{symbol.upper()} / USDT ({timeframe}) | Pattern: {pattern_name} "
        f"| Verdict: {verdict} ({confidence_score}%) | Spot: ${current_price:.4f}"
    )
    ax_main.set_title(title_str, color="#F8FAFC", fontsize=10, fontweight="bold", pad=12, loc="left")

    ax_main.legend(
        facecolor="#0F172A", edgecolor="#334155", labelcolor="#E2E8F0",
        loc="upper left", fontsize=7.2, framealpha=0.92, ncol=2
    )

    # Save to disk
    plt.savefig(chart_path, facecolor=fig.get_facecolor(), edgecolor="none", bbox_inches="tight")

    # Base64 data URI
    buf = io.BytesIO()
    plt.savefig(buf, format="png", facecolor=fig.get_facecolor(), edgecolor="none", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    b64_str = base64.b64encode(buf.read()).decode("utf-8")
    data_uri = f"data:image/png;base64,{b64_str}"

    return {
        "file_path": chart_path,
        "filename": chart_filename,
        "data_uri": data_uri
    }
