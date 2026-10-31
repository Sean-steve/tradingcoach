import { formatMoney } from "@/lib/format";

/** Do not silently display historical unconfirmed monetary records as USD. */
export type CurrencyAccount = { currency?: string | null; currency_confirmed_at?: string | null };
export function formatAccountMoney(
  amount: number,
  account: CurrencyAccount | null | undefined,
  opts: { sign?: boolean } = {},
): string {
  if (!account?.currency_confirmed_at) {
    const n = Number(amount);
    const sign = opts.sign && n > 0 ? "+" : "";
    return sign + n.toFixed(2) + " (currency unreviewed)";
  }
  return formatMoney(amount, account.currency ?? "USD", opts);
}
