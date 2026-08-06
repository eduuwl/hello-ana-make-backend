import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundApiException, ValidationApiException } from '../common/exceptions/common.exceptions';
import { ApiException } from '../common/exceptions/api.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { toCartResponse, buildCartItems, CartWithItems } from './mappers/cart.mapper';
import { CouponsService, CouponValidationStatus } from '../coupons/coupons.service';
import { ShippingService } from '../shipping/shipping.service';
import { SelectShippingDto } from '../shipping/dto/select-shipping.dto';

const STORE_MAX_QTY = 10;

const COUPON_ERROR_CODES: Partial<Record<CouponValidationStatus, string>> = {
  invalid: 'COUPON_INVALID',
  expired: 'COUPON_EXPIRED',
  inactive: 'COUPON_INACTIVE',
  min_order_not_met: 'COUPON_MIN_ORDER',
  not_started: 'COUPON_NOT_STARTED',
  usage_limit_reached: 'COUPON_USAGE_LIMIT_REACHED',
  not_applicable: 'COUPON_NOT_APPLICABLE',
  already_used: 'COUPON_ALREADY_USED',
};

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couponsService: CouponsService,
    private readonly shippingService: ShippingService,
  ) {}

  async getCart(user: AuthenticatedUser | null, cartIdHeader?: string) {
    const cart = await this.resolveCart(user, cartIdHeader);
    return this.toResponse(cart, user);
  }

  async addItem(user: AuthenticatedUser | null, cartIdHeader: string | undefined, dto: AddCartItemDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: { product: true },
    });
    if (!variant || variant.productId !== dto.productId) {
      throw new NotFoundApiException('Variante não encontrada.');
    }

    const cart = await this.resolveCart(user, cartIdHeader);
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
    });

    const desiredQuantity = (existing?.quantity ?? 0) + dto.quantity;
    if (!variant.isAvailable || desiredQuantity > variant.stock) {
      throw new ApiException('Estoque insuficiente.', 'STOCK_UNAVAILABLE', 409);
    }

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: Math.min(desiredQuantity, STORE_MAX_QTY) },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: variant.product.id,
          productSlug: variant.product.slug,
          productName: variant.product.name,
          variantId: variant.id,
          variantSku: variant.sku,
          variantName: variant.name,
          attributes: variant.attributes ?? {},
          image: variant.image ?? '',
          unitPrice: variant.price,
          promotionalPrice: variant.promotionalPrice,
          quantity: Math.min(dto.quantity, STORE_MAX_QTY),
        },
      });
    }

    await this.touchCart(cart.id);
    return this.toResponse(await this.getCartOrThrow(cart.id), user);
  }

  async updateItemQuantity(
    user: AuthenticatedUser | null,
    cartIdHeader: string | undefined,
    itemId: string,
    dto: UpdateCartItemDto,
  ) {
    const cart = await this.resolveCart(user, cartIdHeader);
    const item = await this.prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item || item.cartId !== cart.id) {
      throw new NotFoundApiException('Item não encontrado no carrinho.');
    }

    const variant = await this.prisma.productVariant.findUnique({ where: { id: item.variantId } });
    const maxQuantity = Math.min(variant?.stock ?? 0, STORE_MAX_QTY);
    if (dto.quantity > maxQuantity) {
      throw new ValidationApiException({ quantity: ['Quantidade acima do estoque disponível.'] });
    }

    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity: dto.quantity } });
    await this.touchCart(cart.id);
    return this.toResponse(await this.getCartOrThrow(cart.id), user);
  }

  async removeItem(user: AuthenticatedUser | null, cartIdHeader: string | undefined, itemId: string) {
    const cart = await this.resolveCart(user, cartIdHeader);
    const item = await this.prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item || item.cartId !== cart.id) {
      throw new NotFoundApiException('Item não encontrado no carrinho.');
    }
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    await this.touchCart(cart.id);
    return this.toResponse(await this.getCartOrThrow(cart.id), user);
  }

  async clear(user: AuthenticatedUser | null, cartIdHeader?: string) {
    const cart = await this.resolveCart(user, cartIdHeader);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: null, shippingOptionId: null, shippingPrice: null },
    });
    return this.toResponse(await this.getCartOrThrow(cart.id), user);
  }

  async applyCoupon(user: AuthenticatedUser | null, cartIdHeader: string | undefined, code: string) {
    const cart = await this.resolveCart(user, cartIdHeader);
    const { subtotal, lines } = await this.computeSubtotalAndLines(cart);

    if (subtotal <= 0) {
      throw new ValidationApiException({ code: ['O carrinho está vazio.'] });
    }

    const validation = await this.couponsService.validate({
      code,
      userId: user?.id ?? null,
      cartSubtotal: subtotal,
      productIds: lines.map((l) => l.productId),
      categoryIds: lines.map((l) => l.categoryId),
      lines,
    });

    if (validation.status !== 'valid') {
      throw new ApiException(validation.message, COUPON_ERROR_CODES[validation.status] ?? 'COUPON_INVALID', 422);
    }

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: validation.coupon?.code },
    });

    const response = await this.toResponse(await this.getCartOrThrow(cart.id), user);
    return { cart: response, validation };
  }

  async removeCoupon(user: AuthenticatedUser | null, cartIdHeader?: string) {
    const cart = await this.resolveCart(user, cartIdHeader);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return this.toResponse(await this.getCartOrThrow(cart.id), user);
  }

  async selectShipping(user: AuthenticatedUser | null, cartIdHeader: string | undefined, dto: SelectShippingDto) {
    const cart = await this.resolveCart(user, cartIdHeader);
    const { subtotal } = await this.computeSubtotalAndLines(cart);
    const price = this.shippingService.priceFor(dto.shippingOptionId, subtotal);

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { shippingOptionId: dto.shippingOptionId, shippingPrice: price },
    });

    return this.toResponse(await this.getCartOrThrow(cart.id), user);
  }

  private async getCartOrThrow(id: string): Promise<CartWithItems> {
    const cart = await this.prisma.cart.findUnique({ where: { id }, include: { items: true } });
    if (!cart) throw new NotFoundApiException('Carrinho não encontrado.');
    return cart;
  }

  private async touchCart(id: string) {
    await this.prisma.cart.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  private async computeSubtotalAndLines(cart: CartWithItems) {
    const variantIds = cart.items.map((i) => i.variantId);
    const variants = variantIds.length
      ? await this.prisma.productVariant.findMany({ where: { id: { in: variantIds } } })
      : [];
    const variantsById = new Map(variants.map((v) => [v.id, v]));
    const { items, subtotal } = buildCartItems(cart, variantsById);

    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = productIds.length
      ? await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } })
      : [];
    const categoryByProduct = new Map(products.map((p) => [p.id, p.categoryId]));

    const lines = items.map((item) => ({
      productId: item.productId,
      categoryId: categoryByProduct.get(item.productId) ?? '',
      lineTotal: item.lineTotal,
    }));

    return { items, subtotal, lines };
  }

  /**
   * Recalcula cupom (auto-remove se deixou de ser válido — ex.: subtotal caiu abaixo do
   * mínimo) e resolve o preço de frete já cotado. docs/04-carrinho.md → campos extras sugeridos.
   */
  private async toResponse(cart: CartWithItems, user: AuthenticatedUser | null) {
    const { items, subtotal, lines } = await this.computeSubtotalAndLines(cart);

    let discount = 0;
    let freeShipping = false;
    let couponCode: string | undefined = cart.couponCode ?? undefined;
    let couponMessage: string | undefined;

    if (couponCode) {
      const validation = await this.couponsService.validate({
        code: couponCode,
        userId: user?.id ?? null,
        cartSubtotal: subtotal,
        productIds: lines.map((l) => l.productId),
        categoryIds: lines.map((l) => l.categoryId),
        lines,
      });

      if (validation.status === 'valid') {
        discount = validation.discountAmount;
        freeShipping = validation.coupon?.type === 'free_shipping';
        couponMessage = validation.message;
      } else {
        // Cupom deixou de valer (ex.: carrinho mudou) — solta ele do carrinho.
        await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
        couponCode = undefined;
      }
    }

    const shipping = cart.shippingPrice !== null ? Number(cart.shippingPrice) : 0;

    return toCartResponse({
      cart,
      items,
      subtotal,
      discount,
      shipping,
      couponCode,
      freeShipping,
      couponMessage,
    });
  }

  /**
   * Resolve o carrinho ativo: por `userId` se logado, por `X-Cart-Id` se guest.
   * Se logado e existir um carrinho guest referenciado no header, faz o merge
   * (soma quantidades, cap no estoque) e descarta o carrinho guest (docs/04-carrinho.md).
   */
  private async resolveCart(
    user: AuthenticatedUser | null,
    cartIdHeader: string | undefined,
  ): Promise<CartWithItems> {
    if (!user) {
      if (cartIdHeader) {
        const guestCart = await this.prisma.cart.findUnique({
          where: { id: cartIdHeader },
          include: { items: true },
        });
        if (guestCart && !guestCart.userId) {
          return guestCart;
        }
      }
      return this.prisma.cart.create({ data: {}, include: { items: true } });
    }

    let userCart = await this.prisma.cart.findUnique({
      where: { userId: user.id },
      include: { items: true },
    });

    if (!userCart && cartIdHeader) {
      const guestCart = await this.prisma.cart.findUnique({ where: { id: cartIdHeader } });
      if (guestCart && !guestCart.userId) {
        userCart = await this.prisma.cart.update({
          where: { id: guestCart.id },
          data: { userId: user.id },
          include: { items: true },
        });
      }
    }

    if (!userCart) {
      userCart = await this.prisma.cart.create({ data: { userId: user.id }, include: { items: true } });
    } else if (cartIdHeader && cartIdHeader !== userCart.id) {
      const guestCart = await this.prisma.cart.findUnique({
        where: { id: cartIdHeader },
        include: { items: true },
      });
      if (guestCart && !guestCart.userId) {
        userCart = await this.mergeGuestCart(userCart, guestCart);
      }
    }

    return userCart;
  }

  private async mergeGuestCart(
    userCart: CartWithItems,
    guestCart: CartWithItems,
  ): Promise<CartWithItems> {
    for (const guestItem of guestCart.items) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: guestItem.variantId },
      });
      const stockCap = Math.min(variant?.stock ?? 0, STORE_MAX_QTY);

      const existing = userCart.items.find((i) => i.variantId === guestItem.variantId);
      if (existing) {
        await this.prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: Math.min(existing.quantity + guestItem.quantity, stockCap || existing.quantity) },
        });
      } else if (stockCap > 0) {
        await this.prisma.cartItem.create({
          data: {
            cartId: userCart.id,
            productId: guestItem.productId,
            productSlug: guestItem.productSlug,
            productName: guestItem.productName,
            variantId: guestItem.variantId,
            variantSku: guestItem.variantSku,
            variantName: guestItem.variantName,
            attributes: guestItem.attributes ?? {},
            image: guestItem.image,
            unitPrice: guestItem.unitPrice,
            promotionalPrice: guestItem.promotionalPrice,
            quantity: Math.min(guestItem.quantity, stockCap),
          },
        });
      }
    }

    await this.prisma.cart.delete({ where: { id: guestCart.id } });
    return this.getCartOrThrow(userCart.id);
  }
}
