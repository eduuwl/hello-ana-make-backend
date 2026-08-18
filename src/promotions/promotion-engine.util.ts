import { Promotion as PromotionModel } from '@prisma/client';
import { BuyXGetYRule, KitItem, ProgressiveDiscountTier } from './mappers/promotion.mapper';

export interface PreviewLine {
  productId: string;
  variantId: string;
  categoryId: string;
  brandId: string;
  quantity: number;
  unitPrice: number;
}

export interface PreviewResult {
  discountAmount: number;
  appliedPromotionIds: string[];
  lines: { productId: string; variantId: string; unitEffectivePrice: number; lineDiscount: number }[];
}

interface EngineLine extends PreviewLine {
  index: number;
  discount: number;
  claimed: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  return (value as { toNumber(): number }).toNumber();
}

function hasScope(promo: PromotionModel): boolean {
  return promo.productIds.length > 0 || promo.categoryIds.length > 0 || promo.brandIds.length > 0;
}

function matchesScope(promo: PromotionModel, line: EngineLine): boolean {
  if (!hasScope(promo)) return false;
  return (
    promo.productIds.includes(line.productId) ||
    promo.categoryIds.includes(line.categoryId) ||
    promo.brandIds.includes(line.brandId)
  );
}

function benefitScore(promo: PromotionModel): number {
  const discountPercentage = toNumber(promo.discountPercentage);
  const discountAmount = toNumber(promo.discountAmount);
  if (discountPercentage !== undefined) return discountPercentage;
  if (discountAmount !== undefined) return discountAmount;
  const buyXGetY = promo.buyXGetY as unknown as BuyXGetYRule | null;
  if (buyXGetY) return buyXGetY.getDiscountPercentage;
  const tiers = promo.progressiveTiers as unknown as ProgressiveDiscountTier[] | null;
  if (tiers?.length) return Math.max(...tiers.map((t) => t.discountPercentage));
  if ((promo.kitItems as unknown as KitItem[] | null)?.length && promo.kitPrice !== null) return 1;
  return 0;
}

function applyDirectDiscount(promo: PromotionModel, candidates: EngineLine[]): Set<number> {
  const touched = new Set<number>();
  const discountPercentage = toNumber(promo.discountPercentage);
  const discountAmount = toNumber(promo.discountAmount);

  for (const line of candidates) {
    const lineSubtotal = line.unitPrice * line.quantity;
    const discount =
      discountPercentage !== undefined
        ? lineSubtotal * (discountPercentage / 100)
        : Math.min(discountAmount ?? 0, lineSubtotal);
    if (discount > 0) {
      line.discount = discount;
      touched.add(line.index);
    }
  }
  return touched;
}

function applyProgressive(promo: PromotionModel, candidates: EngineLine[]): Set<number> {
  const touched = new Set<number>();
  const tiers = (promo.progressiveTiers as unknown as ProgressiveDiscountTier[] | null) ?? [];
  if (!tiers.length) return touched;

  const totalQty = candidates.reduce((sum, l) => sum + l.quantity, 0);
  const tier = [...tiers]
    .sort((a, b) => a.minQuantity - b.minQuantity)
    .reverse()
    .find((t) => totalQty >= t.minQuantity);
  if (!tier) return touched;

  for (const line of candidates) {
    line.discount = line.unitPrice * line.quantity * (tier.discountPercentage / 100);
    touched.add(line.index);
  }
  return touched;
}

// "A cada groupSize itens elegíveis, os getQuantity mais baratos do grupo recebem o desconto"
// (06-promocoes.md → Buy X Get Y). Unidades ordenadas do mais caro pro mais barato e agrupadas
// sequencialmente garante que a cauda de cada grupo completo seja sempre a mais barata.
function applyBuyXGetY(promo: PromotionModel, candidates: EngineLine[]): Set<number> {
  const touched = new Set<number>();
  const rule = promo.buyXGetY as unknown as BuyXGetYRule | null;
  if (!rule) return touched;

  const groupSize = rule.buyQuantity + rule.getQuantity;
  if (groupSize <= 0) return touched;

  const units: { lineIndex: number; price: number }[] = [];
  for (const line of candidates) {
    for (let i = 0; i < line.quantity; i++) {
      units.push({ lineIndex: line.index, price: line.unitPrice });
    }
  }

  const ordered = rule.applyToCheapest ? [...units].sort((a, b) => b.price - a.price) : units;
  const groupCount = Math.floor(ordered.length / groupSize);

  const discountByLine = new Map<number, number>();
  for (let g = 0; g < groupCount; g++) {
    const group = ordered.slice(g * groupSize, (g + 1) * groupSize);
    const getUnits = group.slice(rule.buyQuantity);
    for (const unit of getUnits) {
      const discount = unit.price * (rule.getDiscountPercentage / 100);
      discountByLine.set(unit.lineIndex, (discountByLine.get(unit.lineIndex) ?? 0) + discount);
      touched.add(unit.lineIndex);
    }
  }

  for (const line of candidates) {
    const discount = discountByLine.get(line.index);
    if (discount) line.discount = discount;
  }
  return touched;
}

function applyKit(promo: PromotionModel, candidates: EngineLine[]): Set<number> {
  const touched = new Set<number>();
  const kitItems = (promo.kitItems as unknown as KitItem[] | null) ?? [];
  const kitPrice = toNumber(promo.kitPrice);
  if (!kitItems.length || kitPrice === undefined) return touched;

  const matches: { line: EngineLine; quantity: number }[] = [];
  for (const kitItem of kitItems) {
    const line = candidates.find(
      (l) =>
        l.productId === kitItem.productId &&
        (!kitItem.variantId || l.variantId === kitItem.variantId) &&
        l.quantity >= kitItem.quantity,
    );
    if (!line) return touched;
    matches.push({ line, quantity: kitItem.quantity });
  }

  const originalSum = matches.reduce((sum, m) => sum + m.line.unitPrice * m.quantity, 0);
  const kitDiscount = Math.max(0, originalSum - kitPrice);
  if (kitDiscount <= 0 || originalSum <= 0) return touched;

  for (const m of matches) {
    const share = (m.line.unitPrice * m.quantity) / originalSum;
    m.line.discount = kitDiscount * share;
    touched.add(m.line.index);
  }
  return touched;
}

function applyPromotion(promo: PromotionModel, candidates: EngineLine[]): Set<number> {
  switch (promo.type) {
    case 'direct_discount':
    case 'flash_sale':
      return applyDirectDiscount(promo, candidates);
    case 'progressive':
      return applyProgressive(promo, candidates);
    case 'buy_x_get_y':
      return applyBuyXGetY(promo, candidates);
    case 'kit':
      return applyKit(promo, candidates);
    case 'campaign':
    default:
      return new Set();
  }
}

/**
 * Resolve conflito por linha (não por request inteira): cada promoção "reivindica" as linhas
 * que tocou, em ordem de prioridade desc (desempate: maior benefício declarado). Uma linha só
 * pode ser descontada por uma promoção — igual à regra documentada, mas linhas não sobrepostas
 * podem receber promoções diferentes na mesma preview.
 */
export function computePromotionsPreview(
  inputLines: PreviewLine[],
  promotions: PromotionModel[],
): PreviewResult {
  const lines: EngineLine[] = inputLines.map((line, index) => ({ ...line, index, discount: 0, claimed: false }));

  const applicable = promotions
    .filter((p) => lines.some((l) => matchesScope(p, l)))
    .sort((a, b) => b.priority - a.priority || benefitScore(b) - benefitScore(a));

  const appliedPromotionIds: string[] = [];

  for (const promo of applicable) {
    const candidates = lines.filter((l) => !l.claimed && matchesScope(promo, l));
    if (!candidates.length) continue;

    const touched = applyPromotion(promo, candidates);
    if (touched.size > 0) {
      appliedPromotionIds.push(promo.id);
      for (const index of touched) lines[index].claimed = true;
    }
  }

  const discountAmount = round2(lines.reduce((sum, l) => sum + l.discount, 0));

  return {
    discountAmount,
    appliedPromotionIds,
    lines: lines
      .filter((l) => l.discount > 0)
      .map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        unitEffectivePrice: l.unitPrice,
        lineDiscount: round2(l.discount),
      })),
  };
}
