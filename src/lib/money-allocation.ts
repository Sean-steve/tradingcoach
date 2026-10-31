/**
 * Exact-cent profit earmarks. These are *not* cash withdrawals.
 * Floors each fractional allocation, then distributes remaining cents by the
 * greatest remainder (stable original bucket order for ties).
 */
export function splitAllocationCents(amount: number, percentages: number[]): number[] {
  if (!Number.isFinite(amount) || amount < 0 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7)
    throw Error("Amount must be a nonnegative, cent-exact value");
  if (!percentages.length || percentages.some(p=>!Number.isFinite(p)||p<0||p>100) ||
      Math.abs(percentages.reduce((sum,p)=>sum+p,0)-100)>1e-7)
    throw Error("Percentages must total 100");
  const cents=Math.round(amount * 100);
  const raw=percentages.map(p=>cents*p/100);
  const floors=raw.map(Math.floor);
  const order=raw.map((v,i)=>({i,frac:v-floors[i]}))
    .sort((a,b)=>b.frac-a.frac||a.i-b.i);
  for(let remaining=cents-floors.reduce((a,b)=>a+b,0),i=0;remaining>0;remaining--,i++)
    floors[order[i%order.length].i]++;
  return floors.map(c=>c/100);
}
