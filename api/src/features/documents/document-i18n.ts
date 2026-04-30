/**
 * Multilingual invoice / PO label hints for regex extraction (Latin script + common business English).
 * Accent-aware matching uses Unicode flag where useful.
 */

/** Escape string for use inside RegExp character class or alternation */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build `Label\s*:\s*(capture)` for each label */
function labelCapture(labels: string[], flags = 'imu'): RegExp {
  const alt = labels.map(esc).join('|');
  return new RegExp(`(?:${alt})\\s*[:.]?\\s*([^\\n\\r]+)`, flags);
}

/** Same but allow # before number */
function labelHashCapture(labels: string[]): RegExp {
  const alt = labels.map(esc).join('|');
  return new RegExp(`(?:${alt})\\s*#?\\s*[:.]?\\s*([A-Z0-9\\-_.\\/]+)`, 'imu');
}

// --- Supplier / vendor (issuer side of invoice) ---
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

// --- Document numbers ---
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

// --- Totals ---
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

// --- Dates ---
const ISSUE_DATE_LABELS = [
  'Issue date',
  'Invoice date',
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
  'Payment due',
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
  'Valuta plaćanja',
  'Forfallsdato',
  'Eräpäivä',
  'Vade',
];

export const I18N_REGEX = {
  supplierLine: labelCapture(SUPPLIER_LABELS),
  invoiceNumberLine: labelCapture(INVOICE_NUMBER_LABELS),
  poNumberLine: labelCapture(PO_NUMBER_LABELS),
  genericNumberLine: labelCapture(GENERIC_NUMBER_LABELS),
  invoiceNumberHash: labelHashCapture(['Invoice', 'Facture', 'Rechnung', 'Faktura', 'Fattura']),
  poNumberHash: labelHashCapture(['PO', 'P.O.', 'Bestellung', 'Narudžbenica', 'Pedido']),
  subtotalLine: labelCapture(SUBTOTAL_LABELS),
  taxLine: new RegExp(
    `(?:${[...TAX_LABELS.map(esc), 'Tax\\s*\\([^\\)]+\\)'].join('|')})\\s*[:.]?\\s*([\\d.,\\s]+)`,
    'imu',
  ),
  totalLine: labelCapture(TOTAL_LABELS),
  issueDateLine: labelCapture(ISSUE_DATE_LABELS),
  dueDateLine: labelCapture(DUE_DATE_LABELS),
};

/** Strong invoice-related words (any language in list) */
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

/** ISO 4217 + common symbols (extend as needed) */
export const CURRENCY_FINDER =
  /\b(EUR|USD|GBP|CHF|BAM|RSD|HRK|MKD|ALL|MDL|RON|BGN|TRY|PLN|CZK|HUF|SEK|NOK|DKK|ISK|RUB|UAH|BYN|AED|SAR|QAR|KWD|INR|CNY|JPY|KRW|SGD|HKD|AUD|NZD|CAD|MXN|BRL|ZAR|EGP)\b/i;

/** Additional meta keys (normalized snake_case) that map to canonical fields */
/** CSV header cell matching (first row) */
export const CSV_COLUMN_ALIASES = {
  description: [
    'description',
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
  dueDate: ['due_date', 'due', 'echéance', 'échéance', 'scadenza', 'vencimiento', 'termin'],
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
  return m?.[1]?.trim() ?? null;
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
  const sub = I18N_REGEX.subtotalLine.exec(text)?.[1] ?? null;
  const tax = I18N_REGEX.taxLine.exec(text)?.[1] ?? null;
  const tot = I18N_REGEX.totalLine.exec(text)?.[1] ?? null;
  return { subtotal: sub, tax, total: tot };
}

export function extractIssueDateLoose(text: string): string | null {
  return I18N_REGEX.issueDateLine.exec(text)?.[1]?.trim() ?? null;
}

export function extractDueDateLoose(text: string): string | null {
  return I18N_REGEX.dueDateLine.exec(text)?.[1]?.trim() ?? null;
}

/** Skip table/summary lines when scanning loose PDF rows (multilingual) */
export const LOOSE_ROW_SKIP =
  /^(invoice|facture|rechnung|faktura|fattura|supplier|fournisseur|lieferant|number|broj|datum|date|subtotal|sous|zwischen|tax|tva|vat|mwst|total|totale|gesamt|description|qty|quantity|menge|quantité|cantidad|prezzo|price|prix|betrag)/i;
