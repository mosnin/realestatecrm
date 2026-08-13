export interface WorkspaceProperty { id: string; address?: string; mlsNumber?: string; city?: string; stateRegion?: string; postalCode?: string; propertyType?: string; listPrice?: number | string; price?: number | string; beds?: number | string; baths?: number | string; squareFeet?: number | string; listingStatus?: string; analysis?: unknown; areaReport?: unknown; }
const tokens = (value: string) => value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
const number = (value: unknown) => typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[^0-9.]/g, '')) : NaN;
export function selectWorkspaceTarget(goal: string, rows: WorkspaceProperty[]) {
  const goalTokens = new Set(tokens(goal));
  const exactMls = rows.find((row) => row.mlsNumber && tokens(row.mlsNumber).some((token) => goalTokens.has(token)));
  if (exactMls) return exactMls;
  const ranked = rows.map((row) => ({ row, score: [...tokens(`${row.address ?? ''} ${row.mlsNumber ?? ''}`)].reduce((score, token) => score + (goalTokens.has(token) ? 1 : 0), 0) })).sort((a,b) => b.score-a.score);
  return ranked[0]?.score >= 2 ? ranked[0].row : null;
}
export function rankWorkspaceComparisons(target: WorkspaceProperty | null, rows: WorkspaceProperty[]) {
  if (!target) return rows.slice(0, 5).map((row) => ({ row, score: 0, basis: 'Candidate only: target property was not confidently identified.' }));
  const targetPrice = number(target.listPrice ?? target.price), targetBeds = number(target.beds), targetBaths = number(target.baths), targetSqft = number(target.squareFeet);
  return rows.filter((row) => row.id !== target.id).map((row) => {
    let score = 0; const basis: string[] = [];
    if (row.city && row.city === target.city) { score += 4; basis.push('same city'); }
    if (row.propertyType && row.propertyType === target.propertyType) { score += 3; basis.push('same type'); }
    for (const [label, value, targetValue] of [['price', number(row.listPrice ?? row.price), targetPrice], ['beds', number(row.beds), targetBeds], ['baths', number(row.baths), targetBaths], ['sqft', number(row.squareFeet), targetSqft]] as const) if (Number.isFinite(value) && Number.isFinite(targetValue)) { const delta = Math.abs(value - targetValue) / Math.max(1, targetValue); if (delta <= .2) { score += 2; basis.push(`similar ${label}`); } }
    return { row, score, basis: basis.join(', ') || 'limited comparable facts' };
  }).sort((a,b) => b.score-a.score).slice(0, 5);
}
