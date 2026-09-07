import {expect,it} from 'vitest';
import {closedThisYear} from '@/lib/commissions';
it('excludes an old closing regardless of recent edits',()=>{
 const now=new Date('2026-09-07T12:00:00Z');
 expect(closedThisYear({status:'won',closedAt:'2025-12-01T12:00:00Z'},now)).toBe(false);
 expect(closedThisYear({status:'won',closedAt:'2026-02-01T12:00:00Z'},now)).toBe(true);
 for(const closedAt of [null,'invalid','2027-01-01T12:00:00Z'])expect(closedThisYear({status:'won',closedAt},now)).toBe(false);
 expect(closedThisYear({status:'lost',closedAt:'2026-02-01T12:00:00Z'},now)).toBe(false);
});
