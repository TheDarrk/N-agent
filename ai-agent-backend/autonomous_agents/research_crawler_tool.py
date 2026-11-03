"""
Neptune AI — Research Crawler Tool
Integrates the focused web scrapper & ChromaDB RAG vector store for the Research Agent.
Supports on-demand URL crawling, multi-intent querying, date range filtering, and evidence formatting.
"""

import sys
import os
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional

# Ensure scrapper module can be imported
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent
SCRAPPER_DIR = WORKSPACE_ROOT / "scrapper"
if str(SCRAPPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPPER_DIR))

try:
    import scrapper
except ImportError:
    scrapper = None


def calculate_min_date(date_range: str) -> str:
    """
    Translates a date range selection into an ISO YYYY-MM-DD cutoff string.
    Supports both frontend dropdown values ('1_week', '1_month', '3_months', 'all_recent')
    and CLI shorthand codes ('1w', '1m', '3m', '6m', '1y', 'all').
    """
    now = datetime.now(timezone.utc)
    dr = (date_range or "").lower().strip()
    if dr in ["1_week", "1w", "week", "7_days"]:
        return (now - timedelta(days=7)).strftime("%Y-%m-%d")
    elif dr in ["1_month", "1m", "month", "30_days"]:
        return (now - timedelta(days=30)).strftime("%Y-%m-%d")
    elif dr in ["3_months", "3m", "quarter", "90_days"]:
        return (now - timedelta(days=90)).strftime("%Y-%m-%d")
    elif dr in ["6_months", "6m", "half_year", "180_days"]:
        return (now - timedelta(days=180)).strftime("%Y-%m-%d")
    elif dr in ["1_year", "1y", "year", "365_days"]:
        return (now - timedelta(days=365)).strftime("%Y-%m-%d")
    elif dr in ["all_recent", "all", "evergreen"]:
        return "2024-01-01"
    elif re.match(r"^\d{4}-\d{2}-\d{2}$", dr):
        return dr
    return "2024-01-01"


class ResearchCrawlerTool:
    """
    Tool interface for autonomous agents to crawl sources and retrieve RAG context.
    """

    def __init__(self):
        self.scrapper = scrapper
        if self.scrapper is None:
            print("[RESEARCH TOOL] Warning: scrapper module could not be imported")

    def crawl_url(
        self,
        url: str,
        topic: str = "near",
        min_date: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Fetches a web page, extracts text and date, chunks it, and indexes to ChromaDB.
        Returns newly retrieved chunks or preview items.
        """
        if not url or not url.strip().startswith("http"):
            return []
        try:
            clean_url = url.strip()
            self.scrapper.crawl_urls(
                urls=[clean_url],
                topic=topic,
                min_date_override=min_date,
                max_pages_per_seed=30,
                max_depth=4
            )
            # Retrieve chunks for this domain/url
            hits = self.search_rag(topic=topic, query=clean_url, n=4)
            # Never replace a failed/user URL with unrelated top-RAG results.
            # The caller can still perform a separate semantic search and will
            # receive an explicit gap if this URL produced no indexed chunks.
            return [h for h in hits if clean_url.rstrip("/") in h.get("url", "").rstrip("/")]
        except Exception as e:
            print(f"[RESEARCH TOOL] Error in crawl_url({url}): {e}")
            return []

    def crawl_custom_sources(
        self,
        urls: List[str],
        topic: str = "near",
        date_range: str = "all_recent",
        max_pages_per_seed: int = 30,
        max_depth: int = 4
    ) -> Dict[str, Any]:
        """
        Crawls user-supplied URLs on demand up to max_depth (default 4), extracting dates and indexing to ChromaDB.
        """
        if not self.scrapper or not urls:
            return {"indexed": 0, "skipped": 0, "urls_processed": []}

        min_date = calculate_min_date(date_range)
        valid_urls = [u.strip() for u in urls if u and u.strip().startswith("http")]
        if not valid_urls:
            return {"indexed": 0, "skipped": 0, "urls_processed": []}

        try:
            return self.scrapper.crawl_urls(
                urls=valid_urls,
                topic=topic,
                min_date_override=min_date,
                max_pages_per_seed=max_pages_per_seed,
                max_depth=max_depth
            )
        except Exception as e:
            print(f"[RESEARCH TOOL] Error during custom crawl: {e}")
            return {"error": str(e), "indexed": 0, "skipped": 0, "urls_processed": []}

    def search_rag(
        self,
        topic: str,
        query: str,
        n: int = 5,
        classification: Optional[str] = None,
        date_range: Optional[str] = None,
        cutoff_date: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Queries ChromaDB for semantic research chunks matching the query,
        strictly enforcing cutoff_date so stale historical chunks are omitted.
        """
        if not self.scrapper:
            return []

        effective_min_date = cutoff_date or (calculate_min_date(date_range) if date_range else None)
        try:
            return self.scrapper.research(
                topic=topic,
                query=query,
                n=n,
                classification=classification,
                min_date=effective_min_date
            )
        except Exception as e:
            print(f"[RESEARCH TOOL] Error querying RAG: {e}")
            return []

    def multi_query_rag(
        self,
        topic: str,
        queries: List[str],
        n_per_query: int = 4,
        date_range: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Executes multiple intent queries in parallel, merging and deduplicating chunks.
        """
        all_hits = []
        seen_texts = set()

        for q in queries:
            hits = self.search_rag(topic=topic, query=q, n=n_per_query, date_range=date_range)
            for h in hits:
                # Deduplicate by first 80 characters of text
                key = h["text"][:80].strip()
                if key not in seen_texts:
                    seen_texts.add(key)
                    h["matched_query"] = q
                    all_hits.append(h)

        # Sort by distance (lowest cosine distance = highest relevance)
        all_hits.sort(key=lambda x: x.get("distance", 1.0))
        return all_hits

    def format_for_prompt(self, hits: List[Dict[str, Any]]) -> str:
        """
        Formats retrieved hits into clean XML tags for LLM ingestion.
        """
        if not hits:
            return "<retrieved_context>\nNo matching research context found.\n</retrieved_context>"

        blocks = []
        for i, h in enumerate(hits, 1):
            date_str = h.get("published_date") or "N/A"
            cls_str = h.get("classification") or "Evergreen"
            dist = h.get("distance", "N/A")
            blocks.append(
                f'<source index="{i}" url="{h["url"]}" title="{h["title"]}" date="{date_str}" tier="{cls_str}" distance="{dist}">\n'
                f'{h["text"]}\n'
                f'</source>'
            )
        return "<retrieved_context>\n" + "\n\n".join(blocks) + "\n</retrieved_context>"
