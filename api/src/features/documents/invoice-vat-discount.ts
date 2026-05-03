import { roundMoney2Decimals } from './line-items-data';

export type ExtractedVatLine = {
  label: string;
  ratePercent: number | null;
  amount: number;
};

export type ExtractedDiscountLine = {
  label: string;
  amount: number;
};

export type TotalsCheckV1 = {
  version: 1;
  formula: string;
  subtotal: number | null;
  /** VAT amount used in the formula (sum of VAT lines, or single tax when no lines). */
  sumVat: number;
  sumDiscounts: number;
  computedTotal: number | null;
  declaredTotal: number | null;
  delta: number | null;
  withinTolerance: boolean;
};

function parseCellMoney(cell: string, parseMoney: (s: string) => number | null): number | null {
  const t = cell.replace(/\s+/g, ' ').trim();
  if (!t) {
    return null;
  }
  const v = parseMoney(t.replace(/EUR|USD|GBP|CHF/gi, '').trim());
  return v != null && Number.isFinite(v) && v >= 0 ? roundMoney2Decimals(v) : null;
}

function parseTrailingMoneyInLine(line: string, parseMoney: (s: string) => number | null): number | null {
  if (line.includes('|')) {
    const parts = line.split('|');
    for (let i = parts.length - 1; i >= 0; i--) {
      const v = parseCellMoney(parts[i] ?? '', parseMoney);
      if (v != null && v > 0) {
        return v;
      }
    }
  }
  const m = line.match(/([\d][\d\s,.'’]*(?:[.,]\d{1,4})?)\s*$/);
  if (m) {
    const compact = m[1].replace(/\s/g, '').replace(/'/g, '').replace(/’/g, '');
    const v = parseMoney(compact);
    if (v != null && v > 0) {
      return roundMoney2Decimals(v);
    }
  }
  return null;
}

export function extractVatLinesFromInvoiceText(
  combined: string,
  parseMoney: (s: string) => number | null,
): ExtractedVatLine[] {
  const out: ExtractedVatLine[] = [];
  const seen = new Set<string>();
  for (const rawLine of combined.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (line.length < 4) {
      continue;
    }
    if (!/\b(vat|tva|tax|btw|gst|mwst)\b/i.test(line)) {
      continue;
    }
    if (/\b(sub\s*total|subtotal|grand\s*total|total\s*due|amount\s*due|balance\s*due)\b/i.test(line)) {
      continue;
    }
    if (/\btaxable\b/i.test(line) && !/\b(vat|tva)\b.*\d/.test(line)) {
      continue;
    }
    const rateM = line.match(/\b(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
    let ratePercent: number | null = null;
    if (rateM) {
      const r = Number(rateM[1].replace(',', '.'));
      if (Number.isFinite(r) && r > 0 && r <= 50) {
        ratePercent = roundMoney2Decimals(r);
      }
    }
    const amount = parseTrailingMoneyInLine(line, parseMoney);
    if (amount == null || amount <= 0) {
      continue;
    }
    const key = `${ratePercent ?? 'x'}|${amount}|${line.slice(0, 48)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      label: line.slice(0, 220),
      ratePercent,
      amount,
    });
  }
  return out;
}

export function extractDiscountLinesFromInvoiceText(
  combined: string,
  parseMoney: (s: string) => number | null,
): ExtractedDiscountLine[] {
  const out: ExtractedDiscountLine[] = [];
  const seen = new Set<string>();
  for (const rawLine of combined.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (line.length < 4) {
      continue;
    }
    if (!/\b(discount|rabatt|remise|price\s*reduction|promo|coupon)\b/i.test(line)) {
      continue;
    }
    if (/\bgrand\s*total\b/i.test(line)) {
      continue;
    }
    const amount = parseTrailingMoneyInLine(line, parseMoney);
    if (amount == null || amount <= 0) {
      continue;
    }
    const key = `${amount}|${line.slice(0, 48)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      label: line.slice(0, 220),
      amount,
    });
  }
  return out;
}

export function buildTotalsCheckV1(opts: {
  subtotal: number | null;
  sumVat: number;
  discountLines: ExtractedDiscountLine[];
  declaredTotal: number | null;
}): TotalsCheckV1 {
  const sumVat = roundMoney2Decimals(opts.sumVat);
  const sumDiscounts = roundMoney2Decimals(opts.discountLines.reduce((a, d) => a + d.amount, 0));
  const sub =
    opts.subtotal != null && Number.isFinite(opts.subtotal)
      ? roundMoney2Decimals(opts.subtotal)
      : null;
  const declared =
    opts.declaredTotal != null && Number.isFinite(opts.declaredTotal)
      ? roundMoney2Decimals(opts.declaredTotal)
      : null;
  const computed =
    sub != null ? roundMoney2Decimals(sub + sumVat - sumDiscounts) : null;
  const delta =
    declared != null && computed != null ? roundMoney2Decimals(computed - declared) : null;
  const tol = Math.max(
    0.05,
    0.02 * Math.max(Math.abs(declared ?? 0), Math.abs(computed ?? 0), 1),
  );
  const withinTolerance =
    declared == null || computed == null ? true : Math.abs(computed - declared) <= tol;
  return {
    version: 1,
    formula: 'subtotal + sum(VAT) − sum(discounts)',
    subtotal: sub,
    sumVat,
    sumDiscounts,
    computedTotal: computed,
    declaredTotal: declared,
    delta,
    withinTolerance,
  };
}
