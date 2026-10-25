"""
Neptune AI — Trading Book RAG Engine
Parses the comprehensive crypto trading book (XML) into structured sections
and retrieves targeted knowledge chunks based on live chart setups.
"""

import os
import xml.etree.ElementTree as ET
from typing import Dict, Any, List, Optional

BOOK_PATH = os.path.join(os.path.dirname(__file__), "knowledge_base", "crypto_trading_book.xml")


class TradingBookRAG:
    """
    RAG retriever for the local Crypto Trading Book XML.
    Parses chapters, sections, rules, and keywords.
    """

    def __init__(self, book_path: str = BOOK_PATH):
        self.book_path = book_path
        self.sections: List[Dict[str, Any]] = []
        self._load_and_parse_book()

    def _load_and_parse_book(self):
        """Loads and parses the XML trading book into searchable memory chunks."""
        if not os.path.exists(self.book_path):
            print(f"[RAG] Warning: Book not found at {self.book_path}")
            return

        try:
            tree = ET.parse(self.book_path)
            root = tree.getroot()

            for chapter in root.findall("chapter"):
                chap_id = chapter.get("id", "")
                chap_title = chapter.get("title", "")

                for section in chapter.findall("section"):
                    sec_id = section.get("id", "")
                    sec_title = section.get("title", "")
                    keywords_elem = section.find("keywords")
                    content_elem = section.find("content")
                    rules_elem = section.find("rules")

                    keywords = (
                        [k.strip().lower() for k in keywords_elem.text.split(",")]
                        if keywords_elem is not None and keywords_elem.text
                        else []
                    )
                    content = content_elem.text.strip() if content_elem is not None and content_elem.text else ""

                    rules = []
                    if rules_elem is not None:
                        for rule in rules_elem.findall("rule"):
                            rules.append({
                                "rule_id": rule.get("id", ""),
                                "text": rule.text.strip() if rule.text else ""
                            })

                    self.sections.append({
                        "chapter_id": chap_id,
                        "chapter_title": chap_title,
                        "section_id": sec_id,
                        "section_title": sec_title,
                        "keywords": keywords,
                        "content": content,
                        "rules": rules
                    })

            print(f"[RAG] Successfully indexed {len(self.sections)} sections from Crypto Trading Book.")
        except Exception as e:
            print(f"[RAG] Error parsing XML book: {e}")

    def retrieve(self, query_context: Dict[str, Any], top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Retrieves the top_k (default 5) most relevant sections of the trading book based on:
        - Geometric pattern recognition (Bull Flag, Double Bottom, BOS, Triangles, Pin Bars)
        - Multi-timeframe trend alignment (EMA 20/50/200, Golden/Death Crosses)
        - Momentum & Volatility (RSI continuation vs overbought/oversold, ATR bands)
        - Institutional risk management & capital hard caps
        """
        if not self.sections:
            return []

        search_terms = set()
        symbol = query_context.get("symbol", "").lower()
        if symbol:
            search_terms.add(symbol)

        # 1. Pattern-Driven Targeted Extraction
        pattern_name = query_context.get("pattern_name", "").lower()
        if pattern_name:
            search_terms.add(pattern_name)
            if "flag" in pattern_name:
                search_terms.update(["bull flag", "bear flag", "continuation", "pole", "consolidation"])
            if "double bottom" in pattern_name or "w" in pattern_name:
                search_terms.update(["double bottom", "reversal", "support", "trough", "divergence"])
            if "triangle" in pattern_name:
                search_terms.update(["ascending triangle", "descending triangle", "symmetrical", "breakout"])
            if "wedge" in pattern_name:
                search_terms.update(["rising wedge", "falling wedge", "reversal", "exhaustion"])
            if "ema" in pattern_name or "moving average" in pattern_name:
                search_terms.update(["moving average", "ema", "pullback", "trend following", "dynamic support"])
            if "structure" in pattern_name or "bos" in pattern_name:
                search_terms.update(["break of structure", "bos", "market structure", "swing high", "swing low"])
            if "pin bar" in pattern_name or "hammer" in pattern_name or "shooting star" in pattern_name:
                search_terms.update(["pin bar", "hammer", "shooting star", "rejection", "wick"])

        # 2. Trend & Moving Average Confluence
        ema_trend = query_context.get("ema_trend", "").lower()
        if ema_trend == "bullish":
            search_terms.update(["bull flag", "trend", "golden cross", "continuation", "bos", "higher high"])
        elif ema_trend == "bearish":
            search_terms.update(["bear flag", "death cross", "reversal", "choch", "lower low"])

        # 3. RSI Momentum vs Reversal Squeeze
        rsi = float(query_context.get("rsi", 50.0))
        if rsi <= 35:
            search_terms.update(["oversold", "divergence", "reversal", "double bottom", "support", "capitulation"])
        elif 45 <= rsi <= 62:
            search_terms.update(["momentum", "continuation", "healthy trend", "pullback"])
        elif rsi >= 68:
            search_terms.update(["overbought", "exhaustion", "blow-off", "retail trap", "divergence"])

        # 4. Volume Surge & Expansion
        if query_context.get("volume_surge", False):
            search_terms.update(["volume", "vsa", "volume spike", "breakout", "liquidity sweep", "institutional volume"])
        else:
            search_terms.update(["low volume", "chop", "consolidation", "range"])

        # 5. Score each section against institutional criteria
        scored_sections = []
        for sec in self.sections:
            score = 0
            # Match keywords (weight 4)
            for kw in sec["keywords"]:
                for st in search_terms:
                    if st in kw or kw in st:
                        score += 4

            # Match title (weight 5)
            title_lower = sec["section_title"].lower()
            for st in search_terms:
                if st in title_lower:
                    score += 5

            # Match content body (weight 1)
            content_lower = sec["content"].lower()
            for st in search_terms:
                if st in content_lower:
                    score += 1

            # Match individual execution rules (weight 3)
            for r in sec.get("rules", []):
                r_text = r.get("text", "").lower()
                for st in search_terms:
                    if st in r_text:
                        score += 3

            # Always give mandatory foundation to risk management & position sizing
            if sec["section_id"] in ["sec_hard_caps", "sec_risk_management", "sec_expectancy"]:
                score += 3

            scored_sections.append((score, sec))

        # Sort descending by relevance score and pick top_k (default 5)
        scored_sections.sort(key=lambda x: x[0], reverse=True)
        return [sec for score, sec in scored_sections[:top_k]]

    def format_for_xml_prompt(self, matched_sections: List[Dict[str, Any]]) -> str:
        """Formats the retrieved book chunks with full conceptual depth and tactical execution rules for prompt injection."""
        lines = ["<retrieved_trading_book_knowledge>"]
        for sec in matched_sections:
            lines.append(f'  <section id="{sec["section_id"]}" title="{sec["section_title"]}" chapter="{sec.get("chapter_title", "")}">')
            lines.append(f'    <theory>{sec.get("content", "").strip()}</theory>')
            lines.append('    <execution_rules>')
            for r in sec.get("rules", []):
                lines.append(f'      <rule id="{r.get("rule_id", "")}">{r.get("text", "")}</rule>')
            lines.append('    </execution_rules>')
            lines.append('  </section>')
        lines.append("</retrieved_trading_book_knowledge>")
        return "\n".join(lines)


# Singleton
trading_book_rag = TradingBookRAG()
