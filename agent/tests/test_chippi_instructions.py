"""Standing automations are executable. The model must not refuse them."""

from __future__ import annotations

import re

from chippi import CHIPPI_INSTRUCTIONS


def test_instructions_do_not_claim_automations_only_draft() -> None:
    text = re.sub(r"\s+", " ", CHIPPI_INSTRUCTIONS.lower())
    assert "only drafts" not in text
    assert "create_automation" in text
    assert "autonomous follow-ups" in text
    assert "never tell the realtor you cannot work autonomously" in text
