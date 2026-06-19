/**
 * Duplicate-contact detection.
 *
 * Two layers:
 *   - PURE helpers (normalize*, nameSimilarity, groupDuplicates) — no DB, fully
 *     unit-testable. These define the fingerprinting + grouping rules.
 *   - findDuplicateGroups(spaceId) — loads a space's contacts and runs the pure
 *     grouping over them. SPACE-SCOPED: only ever reads `.eq('spaceId', …)`, so
 *     a contact from another workspace can never appear in a group.
 *
 * Detection signals (in priority order):
 *   1. Exact normalized EMAIL match (case-insensitive, trimmed)        → high
 *   2. Exact normalized PHONE match (digits only, last-10 compare)     → high
 *   3. Fuzzy NAME similarity (token Jaccard + edit distance) as a
 *      SECONDARY signal — on its own it is "low"; combined with a soft
 *      contact-detail hint it lifts to "medium".
 *
 * A group is the transitive closure over those edges: if A~B by email and
 * B~C by phone, {A,B,C} is one group. Each group carries the strongest
 * confidence among its edges plus the reasons that linked it.
 */

export type DedupConfidence = 'high' | 'medium' | 'low';

/** Minimal shape the detector needs from a Contact row. */
export interface DedupContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  createdAt?: string | Date | null;
}

export interface DuplicateGroup<T extends DedupContact = DedupContact> {
  /** Stable key for the group (smallest member id) — handy for React keys. */
  key: string;
  /** Members of the group, oldest first (the suggested survivor leads). */
  contacts: T[];
  /** Strongest signal that linked any pair in the group. */
  confidence: DedupConfidence;
  /** Human-readable reasons, e.g. ['Same email', 'Similar name']. */
  reasons: string[];
}

// ── Normalization ───────────────────────────────────────────────────────────

/** Lower-case + trim an email. Returns '' for blank/nullish. */
export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

/**
 * Reduce a phone to comparable digits. Strips all non-digits, then — because
 * the same number is stored with and without a country code (+1 vs bare
 * 10-digit US) — compares on the last 10 digits when the number is long enough.
 * Returns '' for blank or implausibly short input (< 7 digits) so junk like
 * "x123" never groups unrelated people.
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Normalize a name for fuzzy comparison: lower-case, strip punctuation, collapse
 * whitespace. Used for token + edit-distance similarity, NOT as an exact key.
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/[.,'"`]/g, '')
    .replace(/\s+/g, ' ');
}

// ── Name similarity ─────────────────────────────────────────────────────────

/** Levenshtein edit distance (iterative, single-row buffer). */
function editDistance(a: string, a2: string): number {
  if (a === a2) return 0;
  if (a.length === 0) return a2.length;
  if (a2.length === 0) return a.length;
  let prev = Array.from({ length: a2.length + 1 }, (_, i) => i);
  let curr = new Array<number>(a2.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= a2.length; j++) {
      const cost = a[i - 1] === a2[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a2.length];
}

/** Single-token similarity in [0,1] via normalized edit distance. */
function tokenSim(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return 1 - editDistance(a, b) / maxLen;
}

/** Two tokens count as "the same" word despite a typo at/above this similarity. */
const TOKEN_MATCH_THRESHOLD = 0.8;

/**
 * Name similarity in [0,1]. Handles BOTH:
 *   - reordering ("Jane Doe" vs "Doe, Jane") — order-independent token matching
 *   - per-token typos ("Jonathan" vs "Jonathon") — tokens match fuzzily, not
 *     just exactly, so a one-letter slip in a first name doesn't tank the score
 *
 * Method: a token-level fuzzy Jaccard. Each token in the smaller set is greedily
 * paired with its best (edit-distance) partner in the other set; pairs scoring
 * >= TOKEN_MATCH_THRESHOLD count as matches. We blend that with whole-string
 * edit similarity and take the max. Returns 0 if either name is blank.
 */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = na.split(' ').filter(Boolean);
  const tb = nb.split(' ').filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;

  // Greedy best-pairing of tokens across the two names (order-independent).
  const used = new Array<boolean>(tb.length).fill(false);
  let matched = 0;
  for (const t of ta) {
    let bestIdx = -1;
    let best = 0;
    for (let j = 0; j < tb.length; j++) {
      if (used[j]) continue;
      const s = tokenSim(t, tb[j]);
      if (s > best) {
        best = s;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0 && best >= TOKEN_MATCH_THRESHOLD) {
      used[bestIdx] = true;
      matched++;
    }
  }
  const union = ta.length + tb.length - matched;
  const fuzzyJaccard = union === 0 ? 0 : matched / union;

  const dist = editDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  const editSim = maxLen === 0 ? 0 : 1 - dist / maxLen;

  return Math.max(fuzzyJaccard, editSim);
}

/** Names this similar (or more) count as a "similar name" edge. */
export const NAME_SIMILARITY_THRESHOLD = 0.82;

// ── Grouping (union-find over duplicate edges) ──────────────────────────────

const CONFIDENCE_RANK: Record<DedupConfidence, number> = { low: 0, medium: 1, high: 2 };

function strongest(a: DedupConfidence, b: DedupConfidence): DedupConfidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

/**
 * Group likely-duplicate contacts. Pure — operates on whatever list you pass.
 * The caller is responsible for passing only ONE space's contacts (the DB
 * wrapper below does that). Returns only groups of size >= 2.
 */
export function groupDuplicates<T extends DedupContact>(contacts: T[]): DuplicateGroup<T>[] {
  const n = contacts.length;
  // Union-find
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (x: number, y: number) => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent[rx] = ry;
  };

  // Per-pair reasons + confidence, keyed by the canonical root after unioning.
  type Edge = { confidence: DedupConfidence; reason: string };
  const edges: Edge[] = [];
  const edgeOf = (i: number, j: number): Edge[] => {
    const out: Edge[] = [];
    const emailI = normalizeEmail(contacts[i].email);
    const emailJ = normalizeEmail(contacts[j].email);
    const phoneI = normalizePhone(contacts[i].phone);
    const phoneJ = normalizePhone(contacts[j].phone);
    const emailMatch = emailI !== '' && emailI === emailJ;
    const phoneMatch = phoneI !== '' && phoneI === phoneJ;
    const sim = nameSimilarity(contacts[i].name, contacts[j].name);
    const nameMatch = sim >= NAME_SIMILARITY_THRESHOLD;

    if (emailMatch) out.push({ confidence: 'high', reason: 'Same email' });
    if (phoneMatch) out.push({ confidence: 'high', reason: 'Same phone' });
    if (nameMatch) {
      // A fuzzy-name match ALONE is weak; paired with any contact-detail
      // overlap it is a medium signal. We never link on name alone unless the
      // names are (near-)identical AND there's at least a shared detail — to
      // avoid grouping two different "John Smith"s. Name-only edges are still
      // emitted at 'low' so a same-detail group can surface the name reason.
      const conf: DedupConfidence = emailMatch || phoneMatch ? 'medium' : 'low';
      out.push({ confidence: conf, reason: 'Similar name' });
    }
    return out;
  };

  // O(n^2) over the space's contacts. The caller caps n (see DEDUP_SCAN_CAP).
  // Group bookkeeping keyed by root index.
  const groupConf = new Map<number, DedupConfidence>();
  const groupReasons = new Map<number, Set<string>>();

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const es = edgeOf(i, j);
      if (es.length === 0) continue;
      // Only link on a STRONG signal (email or phone). A name-only ('low')
      // edge never unions on its own — it just decorates a group already linked
      // by a hard identifier, so we don't merge distinct people who share a name.
      const hasStrong = es.some((e) => e.confidence === 'high');
      if (!hasStrong) continue;
      union(i, j);
      edges.push(...es);
    }
  }

  // Collapse edges onto roots.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) !== find(j)) continue;
      const root = find(i);
      const es = edgeOf(i, j);
      for (const e of es) {
        groupConf.set(root, strongest(groupConf.get(root) ?? 'low', e.confidence));
        const set = groupReasons.get(root) ?? new Set<string>();
        set.add(e.reason);
        groupReasons.set(root, set);
      }
    }
  }
  void edges;

  // Assemble groups of size >= 2.
  const buckets = new Map<number, T[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = buckets.get(root) ?? [];
    arr.push(contacts[i]);
    buckets.set(root, arr);
  }

  const groups: DuplicateGroup<T>[] = [];
  for (const [root, members] of buckets) {
    if (members.length < 2) continue;
    // Oldest first → the suggested survivor (longest-lived record) leads.
    members.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
    const reasons = Array.from(groupReasons.get(root) ?? new Set<string>());
    groups.push({
      key: members.reduce((min, c) => (c.id < min ? c.id : min), members[0].id),
      contacts: members,
      confidence: groupConf.get(root) ?? 'low',
      reasons: reasons.length ? reasons : ['Possible duplicate'],
    });
  }

  // Strongest, largest groups first.
  groups.sort((a, b) => {
    const r = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (r !== 0) return r;
    return b.contacts.length - a.contacts.length;
  });

  return groups;
}

/**
 * Cap on how many contacts the O(n^2) scan considers in one pass. Spaces with
 * more contacts than this scan their most-recent slice (the API orders by
 * createdAt desc) — duplicates are overwhelmingly recent intake/import dupes.
 */
export const DEDUP_SCAN_CAP = 2000;
