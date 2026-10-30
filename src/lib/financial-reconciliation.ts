/** Cash accounting and read-only reconciliation. Allocations are earmarks, not cash. */
export interface CashMovement {
  kind: "deposit" | "withdrawal";
  amount: number;
}
export interface FinancialTrade {
  result: string;
  pnl: number | string;
}
export function expectedCashBalance(
  startingBalance: number,
  trades: FinancialTrade[],
  movements: CashMovement[],
): number {
  const pnl = trades.filter(t => t.result !== "open")
    .reduce((sum,t) => sum + Number(t.pnl),0);
  const cash = movements.reduce((sum,t) => sum + (t.kind === "deposit" ? t.amount : -t.amount),0);
  return Math.round((startingBalance + pnl + cash) * 100) / 100;
}
export function balanceVariance(booked: number, expected: number): number {
  return Math.round((booked - expected) * 100) / 100;
}
export function groupBalancesByCurrency(
  accounts: Array<{currency?: string | null; current_balance: number | string}>,
): Array<{currency: string; balance: number}> {
  const map = new Map<string,number>();
  for (const account of accounts) {
    const currency = account.currency ?? "USD";
    map.set(currency,(map.get(currency) ?? 0) + Number(account.current_balance));
  }
  return [...map.entries()].sort(([a],[b])=>a.localeCompare(b))
    .map(([currency,balance])=>({currency,balance:Math.round(balance*100)/100}));
}
export function splitAllocationCents(
  amount: number,
  percentages: number[],
): number[] {
  if (!Number.isFinite(amount) || amount < 0 || Math.abs(amount*100-Math.round(amount*100)) > 0.0000001) {
    throw new Error("Allocation amount must be a nonnegative amount in cents");
  }
  if (percentages.some(p=>!Number.isFinite(p)||p<0||p>100)
      || Math.abs(percentages.reduce((a,b)=>a+b,0)-100)>0.00001) {
    throw new Error("Allocation percentages must add up to 100");
  }
  const total = Math.round(amount*100);
  let allocated = 0;
  return percentages.map((p,i)=>{
    const cents = i === percentages.length-1 ? total - allocated : Math.floor(total * p / 100);
    allocated += cents;
    return cents / 100;
  });
}
