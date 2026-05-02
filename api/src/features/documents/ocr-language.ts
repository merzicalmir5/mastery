import { franc } from 'franc';

/**
 * First OCR pass language list. We omit `ita` here: upstream `ita.traineddata`
 * often triggers stderr `Error: failed to load ./ita.special-words` (harmless;
 * see tessdata issues around Italian special-words). Italian is still applied in
 * {@link detectTesseractRefinementLang} when franc detects `ita`.
 */
export const OCR_INITIAL_LANGS = 'eng+fra+deu+bos+hrv+srp+slv+pol+spa+nld+por';

const FRANC_TO_TESSERACT: Record<string, string> = {
  eng: 'eng',
  fra: 'fra',
  frm: 'fra',
  deu: 'deu',
  bos: 'bos',
  hrv: 'hrv',
  srp: 'srp',
  hbs: 'bos',
  slv: 'slv',
  pol: 'pol',
  spa: 'spa',
  ita: 'ita',
  nld: 'nld',
  por: 'por',
  swe: 'swe',
  nor: 'nor',
  nob: 'nor',
  nno: 'nor',
  dan: 'dan',
  ron: 'ron',
  hun: 'hun',
  ces: 'ces',
  slk: 'slk',
  fin: 'fin',
  tur: 'tur',
  rus: 'rus',
  ukr: 'ukr',
};

const FRANC_WHITELIST = Object.keys(FRANC_TO_TESSERACT);

export function detectTesseractRefinementLang(text: string): string | null {
  const sample = text.replace(/\s+/g, ' ').trim();
  if (sample.length < 24) {
    return null;
  }

  const iso = franc(sample, {
    minLength: 20,
    only: FRANC_WHITELIST,
  });

  if (!iso || iso === 'und') {
    return null;
  }

  return FRANC_TO_TESSERACT[iso] ?? null;
}
