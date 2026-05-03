export function roundMoney2Decimals(n: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return 0;
  }
  return Math.round(n * 100) / 100;
}
