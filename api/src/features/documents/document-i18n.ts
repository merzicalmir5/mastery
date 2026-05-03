function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelCapture(labels: string[], flags = 'imu'): RegExp {
  const alt = labels.map(esc).join('|');
  return new RegExp(`(?:${alt})\\s*[:.]?\\s*([^\\n\\r]+)`, flags);
}

function labelCaptureMoneyAmount(labels: string[], flags = 'imu'): RegExp {
  const parts = labels.map((lab) => (lab === 'Total' ? '\\bTotal\\b' : esc(lab)));
  const alt = parts.join('|');
  const amount = '([\\-+]?\\d[\\d.,]*)';
  return new RegExp(
    `(?:${alt})\\s*[:.]?\\s*(?:€|£|\\$|EUR|USD|GBP|CHF)?\\s*${amount}`,
    flags,
  );
}

function lastCaptureGroup(re: RegExp, text: string, groupIdx = 1): string | null {
  const globalFlags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const r = new RegExp(re.source, globalFlags);
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) {
    const cap = m[groupIdx];
    if (cap != null && cap !== '') {
      last = cap;
    }
  }
  return last;
}

function labelHashCapture(labels: string[]): RegExp {
  const alt = labels.map(esc).join('|');
  return new RegExp(`(?:${alt})\\s*#?\\s*[:.]?\\s*([A-Z0-9\\-_.\\/]+)`, 'imu');
}

const SUPPLIER_LABELS = [
  'Supplier',
  'Vendor',
  'From',
  'Bill from',
  'Sold by',
  'Lieferant',
  'Verkäufer',
  'Anbieter',
  'Fournisseur',
  'Vendeur',
  'Émetteur',
  'Fornitore',
  'Venditore',
  'Proveedor',
  'Vendedor',
  'Emisor',
  'Fornecedor',
  'Leverancier',
  'Verkoper',
  'Dostawca',
  'Sprzedawca',
  'Dodavatel',
  'Dodávateľ',
  'Dobavljač',
  'Dobavljac',
  'Prodavatelj',
  'Furnizor',
  'Furnizorul',
  'Vânzător',
  'Vanzator',
  'Szállító',
  'Eladó',
  'Leverantör',
  'Säljare',
  'Leverandør',
  'Selger',
  'Toimittaja',
  'Myyjä',
  'Tedarikçi',
  'Satıcı',
  'Predávajúci',
  'Dodávateľ',
];

const INVOICE_NUMBER_LABELS = [
  'Invoice number',
  'Invoice no',
  'Invoice No',
  'Invoice #',
  'Invoice Nr',
  'Tax invoice no',
  'Rechnungsnummer',
  'Rechnung Nr',
  'Rechnung-Nr',
  'RG Nr',
  'Facture N°',
  'Facture no',
  'Numéro de facture',
  'N° facture',
  'Numero fattura',
  'N. fattura',
  'Numero de factura',
  'Número de factura',
  'Fakturanummer',
  'Faktura nr',
  'Factuurnummer',
  'Numer faktury',
  'Nr faktury',
  'Číslo faktúry',
  'Cislo faktury',
  'Číslo faktury',
  'Broj računa',
  'Broj fakture',
  'Račun br',
  'Broj dokumenta',
  'Številka računa',
  'Številka dokumenta',
  'Număr factură',
  'Numar factura',
  'Számla szám',
  'Fakturas numurs',
  'PVM sąskaitos numeris',
  'Arve number',
  'Fakturan nr',
  'Faktura nr',
];

const PO_NUMBER_LABELS = [
  'Purchase order',
  'Purchase Order',
  'PO Number',
  'PO #',
  'PO No',
  'P.O.',
  'Bestellung',
  'Bestellnr',
  'Bestellnummer',
  'Bon de commande',
  'N° de commande',
  'Ordine d’acquisto',
  'Ordine di acquisto',
  'Ordine acquisto',
  'Pedido',
  'Orden de compra',
  'Comanda',
  'Número de pedido',
  'Narudžbenica',
  'Narudzbenica',
  'Broj narudžbe',
  'Zamówienie',
  'Numer zamówienia',
  'Objednávka',
  'Číslo objednávky',
];

const GENERIC_NUMBER_LABELS = ['Number', 'No', 'Nr', 'N°', 'Nº', '#'];

const SUBTOTAL_LABELS = [
  'Subtotal',
  'Sub-total',
  'Sub total',
  'Zwischensumme',
  'Zwischen Summe',
  'Sous-total',
  'Sous total',
  'Imponibile',
  'Subtotale',
  'Subtotal neto',
  'Subtotaal',
  'Suma częściowa',
  'Medzisúčet',
  'Mezisoučet',
  'Međuzbir',
  'Mezuzbir',
  'Subtotal brut',
  'Välisumma',
  'Delsumma',
  'Beløb ekskl',
];

const TAX_LABELS = [
  'Tax',
  'VAT',
  'TVA',
  'MwSt',
  'USt',
  'UST',
  'IVA',
  'DDV',
  'PDV',
  'BTW',
  'ÁFA',
  'ALV',
  'Porez',
  'Akonto',
  'Impuesto',
  'Steuer',
  'Impôt',
];

const TOTAL_LABELS = [
  'Grand total',
  'Total due',
  'Amount due',
  'Total',
  'Gesamtbetrag',
  'Gesamt',
  'Summe',
  'Total TTC',
  'Total HT',
  'Montant total',
  'Totale',
  'Importe total',
  'Total a pagar',
  'Totaal',
  'Razem',
  'Łącznie',
  'Celkom',
  'Spolu',
  'Ukupno',
  'Σύνολο',
  'Totalt',
  'Summa',
  'Yhteensä',
  'Genel toplam',
  'Ödenecek tutar',
];

const ISSUE_DATE_LABELS = [
  'Issue date',
  'Invoice date',
  'Date',
  'Datum',
  'Date de facturation',
  'Date facture',
  'Data fattura',
  'Fecha',
  'Fecha de factura',
  'Data wystawienia',
  'Dátum vystavenia',
  'Datum izdaje',
  'Datum izdavanja',
  'Izdano',
  'Kuupäev',
];

const DUE_DATE_LABELS = [
  'Due date',
  'Pay by',
  'Fällig',
  'Fälligkeitsdatum',
  'Échéance',
  'Date d’échéance',
  'Scadenza',
  'Data scadenza',
  'Vencimiento',
  'Data płatności',
  'Termín splatnosti',
  'Datum dospijeća',
  'Rok plaćanja',
  'Rok placanja',
  'Datum valute',
  'Valuta plaćanja',
  'Platiti do',
  'Datum dospeća',
  'Datum dospelosti',
  'Zadnji dan plaćanja',
  'Forfallsdato',
  'Eräpäivä',
  'Vade',
  'Payment due',
];

export const I18N_REGEX = {
  supplierLine: labelCapture(SUPPLIER_LABELS),
  invoiceNumberLine: labelCapture(INVOICE_NUMBER_LABELS),
  poNumberLine: labelCapture(PO_NUMBER_LABELS),
  genericNumberLine: labelCapture(GENERIC_NUMBER_LABELS),
  invoiceNumberHash: labelHashCapture(['Invoice', 'Facture', 'Rechnung', 'Faktura', 'Fattura']),
  poNumberHash: labelHashCapture(['PO', 'P.O.', 'Bestellung', 'Narudžbenica', 'Pedido']),
  subtotalLine: labelCaptureMoneyAmount(SUBTOTAL_LABELS),
  taxLine: new RegExp(
    `(?:${[...TAX_LABELS.map(esc), 'Tax\\s*\\([^\\)]+\\)'].join('|')})\\s*[:.]?\\s*(?:€|£|\\$|EUR|USD|GBP|CHF)?\\s*([\\-+]?\\d[\\d.,]*)`,
    'imu',
  ),
  totalLine: labelCaptureMoneyAmount(TOTAL_LABELS),
  issueDateLine: labelCapture(ISSUE_DATE_LABELS),
  dueDateLine: labelCapture(DUE_DATE_LABELS),
};

const INVOICE_WORDS =
  /\b(invoice|tax\s*invoice|facture|factura|rechnung|fattura|faktura|račun|racun|számla|arve|factuur)\b/i;

const PO_WORDS =
  /\b(purchase\s*order|bestellung|bon\s+de\s+commande|narudžbenica|narudzbenica|pedido\s+de\s+compra|ordine\s+d['’]?\s*acquisto|po\s*#)\b/i;

export function classifyDocTypeHint(text: string): 'INVOICE' | 'PURCHASE_ORDER' | null {
  const i = INVOICE_WORDS.test(text);
  const p = PO_WORDS.test(text);
  if (p && !i) {
    return 'PURCHASE_ORDER';
  }
  if (i && !p) {
    return 'INVOICE';
  }
  if (i && p) {
    const idxI = text.search(INVOICE_WORDS);
    const idxP = text.search(PO_WORDS);
    return idxP >= 0 && (idxI < 0 || idxP < idxI) ? 'PURCHASE_ORDER' : 'INVOICE';
  }
  return null;
}

const ISO_CURRENCY_CODES =
  'EUR|USD|GBP|CHF|BAM|RSD|HRK|MKD|ALL|MDL|RON|BGN|TRY|PLN|CZK|HUF|SEK|NOK|DKK|ISK|RUB|UAH|BYN|AED|SAR|QAR|KWD|INR|CNY|JPY|KRW|SGD|HKD|AUD|NZD|CAD|MXN|BRL|ZAR|EGP';

export const CURRENCY_FINDER = new RegExp(`\\b(${ISO_CURRENCY_CODES})\\b`, 'i');

export function extractCurrencyLoose(text: string): string | null {
  const t = text.replace(/\r/g, '\n');

  if (/\bUSD\b|\bUS\s*\$\b|\bdollars?\b/i.test(t)) {
    return 'USD';
  }

  const dollarHints =
    /\$\s*[\d.,]+|[\d.,]+\s*\$|\$\s*$/m.test(t) || (t.match(/\$/g) ?? []).length >= 1;
  if (dollarHints) {
    return 'USD';
  }

  const codes = ISO_CURRENCY_CODES;

  const fromTotal = new RegExp(
    `\\b(?:(?:grand\\s+)?total|ukupno)\\b\\s*[:.]?\\s*[\\d.,\\s]+\\s*(?:€|£|\\$)?\\s*(${codes})\\b`,
    'im',
  );
  const mTotal = fromTotal.exec(t);
  if (mTotal?.[1]) {
    return mTotal[1].toUpperCase();
  }

  const amountThenCode = new RegExp(
    `(?:^|[\\s,;|])([\\d][\\d.,]*)\\s+(?:€|£|\\$)?\\s*(${codes})\\b`,
    'gim',
  );
  let lastCode: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = amountThenCode.exec(t)) !== null) {
    lastCode = m[2] ?? null;
  }
  if (lastCode) {
    return lastCode.toUpperCase();
  }

  const glued = new RegExp(`([\\d.,]+)(${codes})\\b`, 'gi');
  const mGlue = glued.exec(t);
  if (mGlue?.[2]) {
    return mGlue[2].toUpperCase();
  }

  const fallback = CURRENCY_FINDER.exec(t)?.[1];
  return fallback ? fallback.toUpperCase() : null;
}

export const CSV_COLUMN_ALIASES = {
  description: [
    'description',
    'desc',
    'line_description',
    'item',
    'product',
    'beschreibung',
    'descrizione',
    'descripción',
    'libellé',
    'libelle',
    'opis',
    'artikel',
  ],
  quantity: ['quantity', 'qty', 'menge', 'quantité', 'quantite', 'cantidad', 'qté', 'qte', 'količina'],
  unitPrice: [
    'unit_price',
    'price',
    'preis',
    'prix',
    'prezzo',
    'precio',
    'preço',
    'cena',
    'einzelpreis',
  ],
  lineTotal: [
    'line_total',
    'total_line',
    'total',
    'amount',
    'betrag',
    'montant',
    'importe',
    'iznos',
    'suma',
  ],
};

export const META_ALIASES = {
  supplier: [
    'supplier_name',
    'supplier',
    'vendor',
    'lieferant',
    'fournisseur',
    'fornitore',
    'proveedor',
    'fornecedor',
    'dostawca',
    'dodavatel',
    'dobavljac',
    'dobavljač',
    'furnizor',
    'szallito',
    'leverancier',
    'toimittaja',
    'tedarikci',
  ],
  documentNumber: [
    'document_number',
    'invoice_number',
    'invoice_no',
    'rechnungsnummer',
    'numero_facture',
    'numero_fattura',
    'numer_faktury',
    'cislo_faktury',
    'broj_racuna',
    'broj_fakture',
    'numar_factura',
    'szamla_szam',
    'facture_n',
    'number',
    'nr',
  ],
  issueDate: ['issue_date', 'invoice_date', 'date', 'datum', 'data_fattura', 'fecha', 'data_wystawienia'],
  dueDate: [
    'due_date',
    'due',
    'datum_valute',
    'datum_valute_placanja',
    'rok_placanja',
    'rok_plaćanja',
    'valuta_placanja',
    'datum_dospijeca',
    'datum_dospijeća',
    'echéance',
    'échéance',
    'scadenza',
    'vencimiento',
    'termin',
  ],
  subtotal: ['subtotal', 'sub_total', 'zwischensumme', 'sous_total', 'imponibile'],
  tax: ['tax', 'vat', 'tva', 'mwst', 'iva', 'pdv', 'ddv', 'porez'],
  total: ['total', 'grand_total', 'amount', 'gesamtbetrag', 'totale', 'importe_total', 'razem', 'ukupno'],
  currency: ['currency', 'curr', 'valuta', 'devise', 'moneda', 'waluta'],
};

export function pickMeta(meta: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = meta[k];
    if (v !== undefined && v !== '') {
      return v;
    }
  }
  return undefined;
}

export function extractSupplierLoose(text: string): string | null {
  const m = I18N_REGEX.supplierLine.exec(text);
  if (m?.[1]?.trim()) {
    return m[1].trim();
  }

  const invoiceTo = /\b(?:invoice|bill)\s+to\s*:/i.exec(text);
  if (invoiceTo && invoiceTo.index > 0) {
    const head = text.slice(0, invoiceTo.index);
    const lines = head.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/^invoice$/i.test(line)) {
        continue;
      }
      if (/tagline/i.test(line)) {
        continue;
      }
      if (/^sl\.?\s*$/i.test(line)) {
        continue;
      }
      if (line.length >= 2 && line.length <= 160 && /[a-zA-Z]/.test(line)) {
        return line.replace(/\s+/g, ' ').trim();
      }
    }
  }

  return null;
}

export function extractInvoiceNumberLoose(text: string): string | null {
  for (const re of [
    I18N_REGEX.invoiceNumberLine,
    I18N_REGEX.invoiceNumberHash,
    I18N_REGEX.genericNumberLine,
  ]) {
    const m = re.exec(text);
    if (m?.[1]?.trim()) {
      return m[1].trim();
    }
  }
  return null;
}

export function extractPoNumberLoose(text: string): string | null {
  const m = I18N_REGEX.poNumberLine.exec(text) ?? I18N_REGEX.poNumberHash.exec(text);
  return m?.[1]?.trim() ?? null;
}

export function extractMoneyAfterLabels(text: string): {
  subtotal: string | null;
  tax: string | null;
  total: string | null;
} {
  return {
    subtotal: lastCaptureGroup(I18N_REGEX.subtotalLine, text, 1),
    tax: lastCaptureGroup(I18N_REGEX.taxLine, text, 1),
    total: lastCaptureGroup(I18N_REGEX.totalLine, text, 1),
  };
}

export function extractInvoiceFooterAmountsLoose(text: string): {
  subtotal: string | null;
  tax: string | null;
  total: string | null;
} {
  const tail = text.length > 6000 ? text.slice(-6000) : text;
  const lines = tail.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bottom = lines.slice(-45);

  let subtotal: string | null = null;
  let tax: string | null = null;

  for (const line of bottom) {
    const low = line.toLowerCase();
    if (
      subtotal == null &&
      /sub\s*[-]?\s*tot|subtotal|sub\s+total|sous[- ]total|zwischen/.test(low)
    ) {
      const g =
        line.match(/([+\-]?\d[\d,'’]*[.,]\d{2})\b/) ??
        line.match(/(?:\$|€|£)\s*([+\-]?\d[\d,'’]*[.,]\d{2})/);
      if (g?.[1]) {
        subtotal = g[1];
      }
    }
    if (tax == null && /(?:^|[\s|])(?:tax|vat|tva|pdv|porez)\b/i.test(low)) {
      const g = line.match(/([+\-]?\d[\d,'’]*[.,]?\d*)\s*%?/);
      if (g?.[1]) {
        tax = g[1];
      }
    }
  }

  let total: string | null = null;
  for (let i = bottom.length - 1; i >= 0; i--) {
    const line = bottom[i]!;
    const low = line.toLowerCase();
    if (/sub\s*[-]?\s*tot|subtotal/.test(low)) {
      continue;
    }
    if (
      /\b(?:grand\s+)?total\b|amount\s*due|balance\s*due|montant\s+total|ukupno/i.test(low) &&
      !/sub/.test(low)
    ) {
      let g =
        line.match(/([+\-]?\d[\d,'’]*[.,]\d{2})\b/) ??
        line.match(/(?:\$|€|£)\s*([+\-]?\d[\d,'’]*[.,]\d{2})/);
      if (!g?.[1] && i + 1 < bottom.length) {
        const next = bottom[i + 1]!;
        g =
          next.match(/^\s*(?:\$|€|£)?\s*([+\-]?\d[\d,'’]*[.,]\d{2})\b/) ??
          next.match(/([+\-]?\d[\d,'’]*[.,]\d{2})\b/);
      }
      if (g?.[1]) {
        total = g[1];
        break;
      }
    }
  }

  if (total == null) {
    for (let i = bottom.length - 1; i >= 0; i--) {
      const line = bottom[i]!;
      const low = line.toLowerCase();
      if (/\btotal\b/i.test(low) && !/sub/.test(low)) {
        const g =
          line.match(/([+\-]?\d[\d,'’]*[.,]\d{2})\b/) ??
          line.match(/(?:\$|€|£)\s*([+\-]?\d[\d,'’]*[.,]\d{2})/);
        if (g?.[1]) {
          total = g[1];
          break;
        }
      }
    }
  }

  return { subtotal, tax, total };
}

export function captureLooksLikeDate(s: string): boolean {
  const t = s.trim();
  if (!t) {
    return false;
  }
  return (
    /\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}/.test(t) ||
    /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(t) ||
    /\d{4}-\d{2}-\d{2}/.test(t) ||
    /\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{2,4}/i.test(t)
  );
}

export function extractAnyNumericDateLoose(text: string): string | null {
  const head = text.slice(0, Math.min(text.length, 9000));
  const re = /\b(\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const cap = m[1]?.trim();
    if (cap && captureLooksLikeDate(cap)) {
      return cap.replace(/\s+/g, ' ').trim();
    }
  }
  return null;
}

export function extractIssueDateLoose(text: string): string | null {
  const t = text.replace(/\r/g, '\n');

  const re = I18N_REGEX.issueDateLine;
  const globalFlags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const r = new RegExp(re.source, globalFlags);
  let m: RegExpExecArray | null;
  while ((m = r.exec(t)) !== null) {
    let cap = m[1]?.trim() ?? '';
    if (captureLooksLikeDate(cap)) {
      return cap.replace(/\s+/g, ' ').trim();
    }
    const rest = t.slice((m.index ?? 0) + (m[0]?.length ?? 0));
    const nextDate = /^\s*[.:_-]?\s*\n\s*(\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4})/m.exec(rest);
    const cand = nextDate?.[1]?.trim();
    if (cand && captureLooksLikeDate(cand)) {
      return cand.replace(/\s+/g, ' ').trim();
    }
  }

  const header = t.slice(0, Math.min(t.length, 4500));
  const nearInvoice = /\b(?:invoice|facture|rechnung|faktura)\b[\s\S]{0,900}?(\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4})/i.exec(
    header,
  );
  if (nearInvoice?.[1] && captureLooksLikeDate(nearInvoice[1])) {
    return nearInvoice[1].replace(/\s+/g, ' ').trim();
  }

  const firstNumeric = /\b(\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4})\b/.exec(header);
  if (firstNumeric?.[1] && classifyDocTypeHint(t) === 'INVOICE') {
    return firstNumeric[1].replace(/\s+/g, ' ').trim();
  }

  return null;
}

const LOOKS_LIKE_DATE =
  /\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{2,4}/i;

export function extractDueDateLoose(text: string): string | null {
  const re = I18N_REGEX.dueDateLine;
  const globalFlags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const r = new RegExp(re.source, globalFlags);
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = r.exec(text)) !== null) {
    const cap = m[1]?.trim();
    if (cap) {
      last = cap;
      if (LOOKS_LIKE_DATE.test(cap) || captureLooksLikeDate(cap)) {
        return cap;
      }
    }
  }
  return last;
}

export const LOOSE_ROW_SKIP =
  /^(invoice|facture|rechnung|faktura|fattura|supplier|fournisseur|lieferant|number|broj|datum|date|subtotal|sous|zwischen|tax|tva|vat|mwst|total|totale|gesamt|description|qty|quantity|menge|quantité|cantidad|prezzo|price|prix|betrag|sl\.?|no\.?|item\s*description)/i;
