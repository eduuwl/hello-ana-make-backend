import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersAdminController } from './orders.admin.controller';
import { OrdersService } from './orders.service';
import { AddressesModule } from '../addresses/addresses.module';
import { CouponsModule } from '../coupons/coupons.module';
import { ShippingModule } from '../shipping/shipping.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [AddressesModule, CouponsModule, ShippingModule, PaymentsModule],
  controllers: [OrdersController, OrdersAdminController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
