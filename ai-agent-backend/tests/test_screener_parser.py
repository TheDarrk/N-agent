import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../autonomous_agents')))

from autonomous_agents.trading_pipeline import ScreenerAgent, ScreenerOutput

def test_screener_strict_pydantic_json():
    agent = ScreenerAgent()
    text = '{"selection_reasoning": "ZEC and SPX lead momentum.", "selections": [{"coin": "ZEC", "direction": "LONG"}, {"coin": "SPX", "direction": "LONG"}]}'
    selections, reasoning, err = agent._parse_selections_strict(text, valid_candidates={'ZEC', 'SPX', 'NEAR'})
    assert err is None
    assert len(selections) == 2
    assert selections[0]['coin'] == 'ZEC' and selections[0]['direction'] == 'LONG'
    assert selections[1]['coin'] == 'SPX' and selections[1]['direction'] == 'LONG'

def test_screener_rejects_numeric_tokens():
    agent = ScreenerAgent()
    # Pure numbers or scores like '68' or '70' must NEVER be accepted
    text = '{"selection_reasoning": "numbers", "selections": [{"coin": "68", "direction": "LONG"}]}'
    selections, reasoning, err = agent._parse_selections_strict(text, valid_candidates={'ZEC', 'SPX'})
    assert len(selections) == 0

def test_screener_parse_nested_json_string():
    agent = ScreenerAgent()
    text = '{"selection_reasoning": "{\\"selection_reasoning\\": \\"NEAR qualifies\\", \\"selections\\": [{\\"coin\\\": \\"NEAR\\", \\"direction\\\": \\"LONG\\"}]}"}'
    selections, reasoning, err = agent._parse_selections_strict(text, valid_candidates={'NEAR'})
    assert err is None
    assert len(selections) == 1
    assert selections[0]['coin'] == 'NEAR'
    assert selections[0]['direction'] == 'LONG'

def test_screener_rejects_hallucinated_coins_not_in_candidates():
    agent = ScreenerAgent()
    text = '{"selection_reasoning": "batch", "selections": [{"coin": "BTC", "direction": "LONG"}, {"coin": "NEAR", "direction": "LONG"}]}'
    # Only NEAR is in scanned candidates
    selections, reasoning, err = agent._parse_selections_strict(text, valid_candidates={'NEAR', 'SOL'})
    assert len(selections) == 1
    assert selections[0]['coin'] == 'NEAR'

def test_screener_rejects_raw_monologue_without_json():
    agent = ScreenerAgent()
    # Conversational text without JSON MUST be rejected so the retry loop fires
    text = "Let me think about ZEC. ZEC ~68 LONG. I think it qualifies."
    selections, reasoning, err = agent._parse_selections_strict(text, valid_candidates={'ZEC'})
    assert err is not None
    assert len(selections) == 0
