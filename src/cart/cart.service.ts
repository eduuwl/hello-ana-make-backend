import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundApiException, ValidationApiException } from '../common/exceptions/common.exceptions';
import { ApiException } from '../common/exceptions/api.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { toCartResponse, CartWithItems } from './mappers/cart.mapper';

const STORE_MAX_QTY = 10;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(user: AuthenticatedUser | null, cartIdHeader?: string) {
    const cart = await this.resolveCart(user, cartIdHeader);
    return this.toResponse(cart);
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
    return this.toResponse(await this.getCartOrThrow(cart.id));
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
    return this.toResponse(await this.getCartOrThrow(cart.id));
  }

  async removeItem(user: AuthenticatedUser | null, cartIdHeader: string | undefined, itemId: string) {
    const cart = await this.resolveCart(user, cartIdHeader);
    const item = await this.prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item || item.cartId !== cart.id) {
      throw new NotFoundApiException('Item não encontrado no carrinho.');
    }
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    await this.touchCart(cart.id);
    return this.toResponse(await this.getCartOrThrow(cart.id));
  }

  async clear(user: AuthenticatedUser | null, cartIdHeader?: string) {
    const cart = await this.resolveCart(user, cartIdHeader);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return this.toResponse(await this.getCartOrThrow(cart.id));
  }

  private async getCartOrThrow(id: string): Promise<CartWithItems> {
    const cart = await this.prisma.cart.findUnique({ where: { id }, include: { items: true } });
    if (!cart) throw new NotFoundApiException('Carrinho não encontrado.');
    return cart;
  }

  private async touchCart(id: string) {
    await this.prisma.cart.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  private async toResponse(cart: CartWithItems) {
    const variantIds = cart.items.map((i) => i.variantId);
    const variants = variantIds.length
      ? await this.prisma.productVariant.findMany({ where: { id: { in: variantIds } } })
      : [];
    const variantsById = new Map(variants.map((v) => [v.id, v]));
    return toCartResponse(cart, variantsById);
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
