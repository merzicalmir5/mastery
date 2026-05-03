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
        quantity: v.quantity,
        unitPrice: v.unitPrice,
        lineTotal: v.lineTotal,
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
    quantity: li.quantity,
    unitPrice: li.unitPrice,
    lineTotal: li.lineTotal,
    ...(li.unitLabel != null && String(li.unitLabel).trim() !== ''
      ? { unitLabel: String(li.unitLabel).trim() }
      : {}),
  }));
  const rows = normalizedItems.map((li) => {
    const r: Record<string, string> = {};
    r[slugKeys[0]!] = li.description;
    r[slugKeys[1]!] = String(li.quantity);
    r[slugKeys[2]!] = String(li.unitPrice);
    r[slugKeys[3]!] = String(li.lineTotal);
    if (slugKeys[4]) {
      r[slugKeys[4]!] = li.unitLabel ?? '';
    }
    return r;
  });
  return { version: 1, columns, rows, normalizedItems };
}
