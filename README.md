# Hello Ana Make — Backend (API)

API REST em **NestJS + Prisma + PostgreSQL** para o e-commerce Hello Ana Make. Implementa o
contrato definido no repositório do frontend (`hello-ana-make-frontend/docs/*.md`).

Banco de dados: **Neon** (Postgres serverless). Deploy: **Render**.

---

## Status — o que já está implementado

Fase 1 (catálogo + auth), conforme os docs do frontend:

| Domínio | Docs | Status |
|---|---|---|
| Auth / clientes | `11-auth-clientes.md` | ✅ register, login, refresh, logout, me, forgot/reset-password, signup-promotion |
| Categorias | `02-categorias.md` | ✅ público (flat/tree) + admin CRUD |
| Marcas | `03-marcas.md` | ✅ público + admin CRUD |
| Produtos | `01-produtos.md` | ✅ listagem com filtros/ordenação, detalhe, relacionados + admin CRUD |
| Endereços | `12-enderecos.md` | ✅ CRUD completo + regra de endereço default |
| Cupons | `05-cupons.md` | ✅ validação completa (9 passos), aplicar/remover no carrinho, admin CRUD |
| Frete | `08-frete.md` | ✅ cotação mock PAC/SEDEX/EXPRESSA, seleção no carrinho · ⏳ tracking/shipment (depende de Pedidos) |
| Carrinho | `04-carrinho.md` | ✅ guest via `X-Cart-Id`, merge no login, cupom, frete, totais completos |
| Checkout/Pedidos | `09-checkout-pedidos.md` | ✅ criação com reserva de estoque, máquina de estados, cancelamento, admin CRUD de status |
| Pagamentos | `10-pagamentos.md` | ✅ gateway-agnostic — **mock** e **Asaas** (Pix/cartão/boleto), webhook, reembolso · ⏳ Mercado Pago/Stripe |
| Admin (parcial) | `14-admin.md` | ✅ CRUD de produtos/categorias/marcas/cupons/pedidos · ⏳ dashboard, uploads |

**Ainda não implementado** (próximas fases — ver "Como continuar" abaixo): promoções, recompensas,
favoritos, configurações da loja, dashboard admin, upload de imagens, gateway de pagamento real.

---

## Stack

- **NestJS 10** (TypeScript) — módulos: `auth`, `categories`, `brands`, `products`, `addresses`,
  `coupons`, `shipping`, `cart`, `orders`, `payments`
- **Prisma 5** como ORM, schema em `prisma/schema.prisma`
- **PostgreSQL** (Neon em produção; qualquer Postgres local também funciona)
- **JWT** (access + refresh) via `@nestjs/jwt` + `passport-jwt`
- **class-validator** / **class-transformer** para DTOs e validação
- Todas as respostas de erro seguem o formato do contrato:
  `{ "message": string, "code": string, "errors": Record<string, string[]> }`

---

## Rodando localmente

### 1. Pré-requisitos

- Node.js 20+
- Uma connection string do **Neon** (ou qualquer Postgres). Para criar no Neon:
  1. Acesse [console.neon.tech](https://console.neon.tech/) e crie um projeto.
  2. Em **Connection Details**, copie a string **pooled** (`-pooler`) e a **direct** (sem `-pooler`).

### 2. Configurar ambiente

```bash
npm install
cp .env.example .env
```

Edite `.env`:

```env
DATABASE_URL="postgresql://user:pass@ep-xxxx-pooler.sa-east-1.aws.neon.tech/hello_ana_make?sslmode=require"
DIRECT_URL="postgresql://user:pass@ep-xxxx.sa-east-1.aws.neon.tech/hello_ana_make?sslmode=require"
JWT_ACCESS_SECRET="gere-com-openssl-rand-hex-32"
JWT_REFRESH_SECRET="gere-outro-valor-diferente"
CORS_ORIGIN="http://localhost:3000"
PAYMENT_GATEWAY="mock"
PAYMENT_WEBHOOK_SECRET="gere-outro-valor-diferente"
```

> `DATABASE_URL` (pooled) é usada pela aplicação em runtime; `DIRECT_URL` é usada só pelo Prisma
> para rodar migrations (o pooler do Neon não suporta todas as operações de DDL).

### 3. Banco de dados

```bash
npx prisma migrate dev --name init   # cria as tabelas no Neon
npm run seed                          # popula categorias/marcas/produtos de exemplo + 2 usuários
```

Usuários de teste criados pelo seed:

| E-mail | Senha | Papel |
|---|---|---|
| `admin@helloanamake.com` | `admin123` | admin |
| `ana.silva@email.com` | `helloana123` | customer |

Cupons de teste criados pelo seed: `BEMVINDA10` (10%, só 1ª compra, mín. R$50),
`ANA15` (15%, mín. R$80), `FRETEGRATIS` (zera o frete do carrinho).

### 4. Subir a API

```bash
npm run start:dev
```

API disponível em `http://localhost:8000/api/v1`.

---

## Scripts

| Script | Uso |
|---|---|
| `npm run start:dev` | Servidor com watch mode |
| `npm run build` | Compila para `dist/` |
| `npm run start:prod` | Roda o build (`node dist/main`) |
| `npm run prisma:migrate` | `prisma migrate dev` (local) |
| `npm run prisma:deploy` | `prisma migrate deploy` (produção/CI) |
| `npm run prisma:studio` | Abre o Prisma Studio (GUI do banco) |
| `npm run seed` | Popula dados de exemplo |

---

## Deploy no Render

1. Crie um **Web Service** no Render apontando para este repositório.
2. **Build Command:**
   ```
   npm install && npx prisma generate && npm run build
   ```
3. **Start Command:**
   ```
   npx prisma migrate deploy && npm run start:prod
   ```
4. Configure as variáveis de ambiente do Render com os mesmos nomes do `.env.example`
   (`DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN` apontando
   para o domínio de produção do frontend, etc).
5. O Render define `PORT` automaticamente — `main.ts` já lê `process.env.PORT`.

No frontend (`hello-ana-make-frontend`), aponte `NEXT_PUBLIC_API_URL` para a URL pública do serviço
no Render (ex.: `https://hello-ana-make-backend.onrender.com/api`) e `NEXT_PUBLIC_DATA_SOURCE=api`.

---

## Decisões de implementação (o que não estava 100% explícito nos docs)

- **Sessão de refresh token**: um único refresh token ativo por usuário (`User.refreshTokenHash` +
  `refreshTokenExpiresAt`), não uma tabela de sessões por dispositivo. Simples o suficiente pro MVP;
  evoluir para tabela `sessions` se precisar de múltiplos dispositivos/"sair de todos os lugares".
- **`AuthSession.expiresAt`**: interpretado como a expiração do **refresh token** (a sessão como um
  todo), não do access token (que é curto, 30 min por padrão). É o valor que decide quando o usuário
  precisa logar de novo.
- **Preço/estoque agregados no `Product`**: `totalStock`, `minEffectivePrice`, `maxEffectivePrice` e
  `hasPromotion` são colunas desnormalizadas, recalculadas em toda escrita de variantes
  (`products.service.ts#computeAggregates`). Evita SQL bruto/agregação por relação para ordenar e
  filtrar por preço e estoque na listagem pública — troca-off deliberado de simplicidade.
- **`productCount` de categoria**: soma produtos ativos da própria categoria **+ subcategorias**,
  conforme sugerido em `02-categorias.md`.
- **E-mail de recuperação de senha**: `forgot-password` gera e armazena o token mas **não envia
  e-mail de fato** ainda — só loga no console. Precisa integrar um provedor (Resend/SES/Postmark)
  antes de produção.
- **Reviews/promoções/favoritos no produto**: `rating` vem de colunas simples no `Product`
  (sem tabela de reviews ainda); `isFavorite` sempre retorna `false` (módulo de Favoritos não
  implementado); `product.promotion` (campanhas do domínio Promoções) ainda não é populado.
- **Consumo de cupom (`usageCount`/`already_used`)**: o schema já tem `CouponRedemption` e
  `CouponsService.consume()` prontos, mas **ninguém chama `consume()` ainda** — só o domínio de
  Pedidos/Pagamentos (quando existir) deve chamá-lo no webhook de pagamento confirmado, nunca na
  criação do pedido (docs/05-cupons.md → "Consumo do uso"). Até lá, um cupom com `perUserLimit`
  pode ser reaplicado livremente no carrinho, o que é esperado nesta fase.
- **Cupom no carrinho é recalculado a cada leitura**: se o carrinho mudar (item removido, etc.) e o
  cupom deixar de ser válido, ele é automaticamente removido no próximo `GET /cart` — não fica um
  estado "quebrado" salvo (`cart.service.ts#toResponse`).
- **`POST /coupons/validate` (standalone) vs. cupom aplicado no carrinho**: o endpoint standalone
  recebe só `productIds`/`categoryIds` (sem valor por linha), então cupons `category`/`product`
  usam o `cartSubtotal` inteiro como base ali; já `POST /cart/coupon` tem acesso às linhas reais do
  carrinho e calcula o desconto só sobre os itens elegíveis, como o doc pede.
- **Frete é stateless/mock**: `ShippingService` não tem tabela própria — as 3 opções (PAC/SEDEX/
  Expressa) são uma constante no código, igual ao mock sugerido no doc. Integrar SuperFrete de
  verdade é só trocar o corpo de `shipping.service.ts#quote`, a interface pública não muda.
  `GET /shipping/tracking/{code}` fica para quando houver integração real de transportadora.
- **Reserva de estoque em `Order`**: sem coluna de "reservado" — `OrdersService#create` decrementa
  `ProductVariant.stock` direto (dentro de uma transaction que valida `stock`/`isAvailable` por
  item antes de decrementar), o que já funciona como a reserva sugerida em
  `pending_payment` (docs/09-checkout-pedidos.md). Cancelar (`status → cancelled`) devolve o
  estoque; pagamento confirmado não mexe nele (já foi debitado na criação); reembolso não devolve
  automaticamente (mercadoria pode já ter saído) — ajustável depois se um caso de uso pedir.
- **Endereço do pedido é snapshot em `Json`, não FK**: `Order.shippingAddress`/`billingAddress`
  guardam uma cópia do endereço no momento da compra (mesmo shape de `AddressResponse`), porque o
  `Address` original pode ser editado ou apagado depois e o pedido precisa manter o histórico —
  mesma lógica de snapshot que `CartItem` já usa para preço/nome de produto.
- **`orderNumber` (`HA-YYYY-####`) é gerado por um contador atômico** (`OrderCounter`, `upsert`
  com `increment` dentro da mesma transaction que cria o pedido) em vez de contar linhas
  existentes — evita duas requisições concorrentes gerarem o mesmo número.
- **Gateway de pagamento é plugável, com duas implementações**: `PaymentGateway`
  (`src/payments/gateways/`) é a interface agnóstica de provedor pedida em `10-pagamentos.md`.
  `MockPaymentGateway` (Pix gera QR fake, boleto gera código de barras fake, cartão aprova na hora
  exceto se o token contiver `"fail"`) é o padrão, pra dev/teste sem credenciais.
  `AsaasPaymentGateway` é a integração real — ativa com `PAYMENT_GATEWAY=asaas` +
  `ASAAS_API_KEY`/`ASAAS_API_URL` no `.env` (chave sandbox em https://sandbox.asaas.com >
  Configurações > Integrações > API). Trocar para Mercado Pago/Stripe no futuro é implementar a
  interface e registrar em `payments.gateway.provider.ts` — nada no resto do domínio muda.
  `POST /orders` só abre cobrança automática para Pix/boleto (não dependem de dado extra do
  cliente); para cartão, o client chama `POST /payments` à parte com o token.
- **Cartão de crédito nunca toca o PAN no backend**: o `card.token` que `POST /payments` espera é
  o `creditCardToken` gerado pelo **Asaas.js** no frontend (tokenização client-side,
  https://docs.asaas.com/reference/tokenizacao-de-cartao-de-credito) — o backend só repassa esse
  token pro Asaas, nunca recebe número/CVV. Isso ainda não está implementado no frontend.
- **Cliente Asaas é criado uma vez por usuário e reaproveitado**: `User.asaasCustomerId` cacheia o
  `id` do cliente no Asaas (criado no primeiro pagamento via `POST /customers`, precisa de
  `User.document` preenchido — se faltar, `PaymentsService` responde `422 CUSTOMER_DOCUMENT_REQUIRED`
  em vez de deixar o Asaas rejeitar com um erro genérico).
- **Webhook de pagamento não usa JWT**: `POST /webhooks/payments/{gateway}` é autenticado por um
  segredo compartilhado — `X-Webhook-Secret` pro mock, ou o header `asaas-access-token` que o
  Asaas manda de verdade em cada notificação (nome de header fixo, definido por eles; configure o
  mesmo valor de `PAYMENT_WEBHOOK_SECRET` como "Token de autenticação" ao criar o webhook no
  painel do Asaas, apontando pra `https://<sua-api>/api/v1/webhooks/payments/asaas`). Cada evento
  do Asaas (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED` etc.) é
  traduzido pro nosso `PaymentStatus` em `AsaasPaymentGateway#parseWebhookEvent` — eventos fora
  desse mapa são ignorados (mas ainda respondidos com `200`, pra não gerar retry).
- **Consumo de cupom acontece só no webhook de pagamento confirmado**: `PaymentsService` chama
  `CouponsService.consume()` exatamente como o README já previa antes desse domínio existir —
  nunca na criação do pedido.

---

## Como continuar (próximos domínios, na ordem sugerida)

Cada um tem seu contrato detalhado em `hello-ana-make-frontend/docs/`:

1. **Gateway de pagamento real** (`10-pagamentos.md`) — plugar Asaas/Mercado Pago/Stripe atrás da
   interface `PaymentGateway` (`src/payments/gateways/`), no lugar do `MockPaymentGateway` atual,
   e trocar `PAYMENT_WEBHOOK_SECRET` por verificação de assinatura HMAC real do provedor.
2. **Recompensas** (`07-recompensas.md`) — tiers de brinde por valor; `rewardEligibleAmount` já
   sai pronto no carrinho (`subtotal - discount`), só falta a tabela de tiers e o endpoint de
   progresso.
3. **Favoritos** (`13-favoritos.md`) — depois disso, atualizar `isFavorite` no mapper de produtos.
4. **Promoções** (`06-promocoes.md`) — depois, popular `Product.promotion`.
5. **Configurações da loja** (`15-configuracoes.md`) e restante do **Admin** (`14-admin.md`):
   dashboard, upload de imagens.

Padrões já estabelecidos para seguir nos próximos módulos: DTOs com `class-validator`, mapper
`toXResponse` separado do service, exceptions via `src/common/exceptions`, paginação via
`paginate()`, guards `JwtAuthGuard`/`RolesGuard` + `@Roles('admin')` nas rotas administrativas.
