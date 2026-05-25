"""Broker tool registry — Chippi-for-Brokers.

The brokerage-side agent has its own tool catalog, distinct from the realtor
agent's `agent/chippi.py:make_chippi_agent` toolbelt. Where the realtor side
acts on a single workspace's CRM, the broker side reads across the whole
brokerage's swarm of realtor spaces.

Phase 1 of Chippi-for-Brokers (this file's state) ships ZERO tools. The point
of Phase 1 is wiring: a broker chat surface → this registry → broker system
prompt → permission gates. Phase 2 (read tools — team health, lead pipeline,
response times) and Phase 3 (write tools — set_routing_rule, offboard_member,
adjust_split) append to `BROKER_TOOLS` from their own module files in this
package.

To add a broker tool in Phase 2/3:
  1. Create `agent/tools/broker/<name>.py` with one or more `@function_tool`
     decorated coroutines. Each handler MUST call `require_broker_role(ctx)`
     from `agent/tools/broker/_guards.py` BEFORE doing any DB work — that is
     the third layer of the defense-in-depth permission gate. A tool that
     skips it is a leak.
  2. Import the new tool here and append to `BROKER_TOOLS` below.

The agent runtime (`agent/chippi_broker.py:make_broker_agent`) reads this
list at agent-build time, exactly mirroring how `agent/chippi.py` reads its
own native tool imports for the realtor agent.
"""

from __future__ import annotations

# Phase 2/3 tools land in this list. Empty in Phase 1 by design.
#
# NOTE on shape: each entry must be a callable decorated with `function_tool`
# from the OpenAI Agents SDK — the same shape as `tools/contacts.py:find_contacts`
# et al on the realtor side. See `agent/tools/broker/_guards.py` for the
# per-handler permission check every entry MUST wrap its handler body in.
BROKER_TOOLS: list = []

__all__ = ["BROKER_TOOLS"]
