export function roundMoney2Decimals(n: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return 0;
  } 
  return Math.round(n * 100) / 100;
}

export function roundMoney2Nullable(n: number | null | undefined): number | null {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) {
    return null;
  }
  return roundMoney2Decimals(n);
}

export function toFixed2JsonNumber(n: number): string {
  return roundMoney2Decimals(n).toFixed(2);
}

export type NormalizedLineItemJson = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  unitLabel?: string;
};

export type LineItemsDataV1 = {
  version: 1;
  columns: string[];
  rows: Array<Record<string, string>>;
  normalizedItems: NormalizedLineItemJson[];
};

export function isLineItemsDataV1(v: unknown): v is LineItemsDataV1 {
  if (!v || typeof v !== 'object') {
    return false;
  }
  const o = v as Record<string, unknown>;
  return (
    o['version'] === 1 &&
    Array.isArray(o['columns']) &&
    Array.isArray(o['rows']) &&
    Array.isArray(o['normalizedItems'])
  );
}

export function normalizedItemsFromLineItemsData(json: unknown): NormalizedLineItemJson[] {
  if (json == null) {
    return [];
  }
  if (!isLineItemsDataV1(json)) {
    return [];
  }
  const out: NormalizedLineItemJson[] = [];
  for (const item of json.normalizedItems) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as NormalizedLineItemJson).description === 'string' &&
      typeof (item as NormalizedLineItemJson).quantity === 'number' &&
      typeof (item as NormalizedLineItemJson).unitPrice === 'number' &&
      typeof (item as NormalizedLineItemJson).lineTotal === 'number'
    ) {
      const v = item as NormalizedLineItemJson;
      out.push({
        description: v.description,
        quantity: roundMoney2Decimals(v.quantity),
        unitPrice: roundMoney2Decimals(v.unitPrice),
        lineTotal: roundMoney2Decimals(v.lineTotal),
        ...(v.unitLabel != null && String(v.unitLabel).trim() !== ''
          ? { unitLabel: String(v.unitLabel).trim() }
          : {}),
      });
    }
  }
  return out;
}

export function slugifyLineItemColumnKeys(headers: string[]): string[] {
  const seen = new Map<string, number>();
  const keys: string[] = [];
  for (let i = 0; i < headers.length; i++) {
    const raw = headers[i] ?? '';
    let base = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .trim();
    if (!base) {
      base = `col_${i}`;
    }
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    keys.push(n === 1 ? base : `${base}_${n}`);
  }
  return keys;
}

export function buildLineItemsDataFromEditorPatch(
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    unitLabel?: string;
  }>,
): LineItemsDataV1 {
  const columns = ['description', 'quantity', 'unitPrice', 'lineTotal', 'unitLabel'];
  const slugKeys = slugifyLineItemColumnKeys(columns);
  const normalizedItems: NormalizedLineItemJson[] = items.map((li) => ({
    description: li.description.trim(),
    quantity: roundMoney2Decimals(li.quantity),
    unitPrice: roundMoney2Decimals(li.unitPrice),
    lineTotal: roundMoney2Decimals(li.lineTotal),
    ...(li.unitLabel != null && String(li.unitLabel).trim() !== ''
      ? { unitLabel: String(li.unitLabel).trim() }
      : {}),
  }));
  const rows = normalizedItems.map((li) => {
    const r: Record<string, string> = {};
    r[slugKeys[0]!] = li.description;
    r[slugKeys[1]!] = toFixed2JsonNumber(li.quantity);
    r[slugKeys[2]!] = toFixed2JsonNumber(li.unitPrice);
    r[slugKeys[3]!] = toFixed2JsonNumber(li.lineTotal);
    if (slugKeys[4]) {
      r[slugKeys[4]!] = li.unitLabel ?? '';
    }
    return r;
  });
  return { version: 1, columns, rows, normalizedItems };
}
