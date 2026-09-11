# Hello Ana Make — Contrato de API (estado real do backend)

Este documento descreve a API **como ela realmente está implementada hoje** no backend NestJS
(`hello-ana-make-backend`), para servir de referência exata na hora de implementar as classes
`Api*Repository` do frontend (`hello-ana-make-frontend/src/repositories/api/*.repository.ts`).

**Por que este arquivo existe além de `hello-ana-make-frontend/docs/*.md`**: aqueles docs foram
escritos *antes* da implementação, como especificação alvo. O backend seguiu-os de perto, mas
tomou algumas decisões próprias (detalhadas na seção 16). Este arquivo documenta o que o código
realmente faz agora — em caso de conflito com `docs/*.md`, **este arquivo é a fonte da verdade**,
porque reflete o servidor com o qual o frontend vai conversar de verdade.

---

## 0. Leia primeiro: status da integração

**Atualizado após a integração real do frontend com este backend** (`hello-ana-make-frontend`,
branch `main`) — as 13 classes `Api*Repository` de `src/repositories/api/` estão implementadas e
testadas de ponta a ponta contra este servidor (carrinho guest→login, checkout completo com
cartão de crédito aprovado/recusado, admin de clientes/upload/reembolso). `src/lib/container.ts`
faz o switch mock↔api via `NEXT_PUBLIC_DATA_SOURCE === "api"`; `src/lib/http-client.ts` é o
wrapper HTTP compartilhado (base URL, `Authorization`, parse de erro, refresh automático em 401).

Únicas exceções, todas de propósito (não são gap do frontend):
- `AsaasPaymentGateway`/`MercadoPagoPaymentGateway`/`StripePaymentGateway` em
  `repositories/api/payment.repository.ts` continuam stub — o gateway é escolhido *neste* backend
  (seção 12.1), o frontend só fala com `POST /payments`.
- `ShippingRepository.createShipment/getTracking/cancelShipment` continuam stub — **este backend
  ainda não expõe rota nenhuma pra isso** (ver seção 7, "O que falta neste backend").

### O que falta neste backend (não é mais responsabilidade do frontend)

1. **Tokenização de cartão** — ver seção 12.3. A suposição original deste doc (Asaas.js
   client-side no navegador) estava errada — o Asaas não tem SDK/chave pública pra isso, só a API
   autenticada com a `access_token` secreta. Já implementei `POST /payments/tokenize-card` aqui
   no backend pra resolver isso (mesma sessão desta atualização) — está funcional e testado (mock
   gateway) em `src/payments/`. **Falta**: testar contra o Asaas sandbox/produção de verdade (só
   validei com `paymentGateway: "mock"`); os campos `creditCardHolderInfo.postalCode`/
   `addressNumber` vêm do endereço de cobrança que o frontend já tem no checkout — não construí
   nenhum fallback caso o usuário não tenha endereço com CEP/número preenchidos além de retornar
   erro (ver seção 12.3).
2. **Frete — envio/rastreio real** (seção 7): `POST /shipping/shipments`, `GET
   /shipping/tracking/:code`, cancelamento de remessa continuam não implementados — sem isso, o
   pedido nunca ganha `trackingCode`/`trackingUrl` de verdade, hoje só o admin preenche isso
   manualmente via `PATCH /admin/orders/:id/status`. Escopo continua sendo só compra de etiqueta
   (gasta saldo real na SuperFrete), fora do que foi pedido pro deadline.
   ~~**Cotação era sempre simulada**~~ ✅ Resolvido — `ShippingService` agora consulta a
   calculadora real da SuperFrete (`POST /api/v0/calculator`, confirmado contra a doc oficial)
   quando `integrations.shippingProvider === "superfrete"` e há `superfreteToken`; sem isso,
   cai automaticamente na tabela mock de sempre (testado: token inválido → 401 → warning no log
   → fallback pro mock, sem quebrar nada). Usa `StoreSettings.shipping.originZipCode` +
   `defaultWeightGrams/Width/Height/Length` como pacote — **não há peso/dimensão por produto no
   banco ainda**, então todo pedido é cotado como um pacote padrão da loja (configurável em
   Admin > Configurações), não a soma real dos itens. `POST /shipping/quote`,
   `PUT /cart/shipping` e a criação do pedido (`OrdersService#create`) foram todos ligados na
   mesma fonte — o preço final cobrado é recalculado ao vivo na criação do pedido em vez de
   confiar no que o cliente viu na cotação (necessário porque os IDs de opção da SuperFrete são
   dinâmicos, ao contrário do catálogo fixo do mock). Testado de ponta a ponta:
   `PUT /cart/shipping` com token inválido configurado, respondeu normal com o preço mock
   (fallback confirmado). **Falta pro Sunday**: configurar `superfreteToken` de verdade em
   Admin > Configurações > Integrações — sem isso, frete continua simulado (não quebra nada).
3. ~~**E-mail transacional**~~ ✅ Resolvido — criei `MailModule`/`MailService`
   (`src/mail/`), envio via API REST do Resend (`fetch`, sem SDK novo, mesmo estilo do
   `AsaasPaymentGateway`), lendo `RESEND_API_KEY`/`MAIL_FROM` do `ConfigService`. Sem
   `RESEND_API_KEY` configurada, `send()` só loga um warning e segue — nunca lança, nunca
   bloqueia cadastro/pedido/reset de senha (testado de ponta a ponta:
   `POST /auth/forgot-password` respondeu normal e logou o warning esperado). Ligado em dois
   pontos: `AuthService#forgotPassword` (link `${FRONTEND_URL}/redefinir-senha?token=...`) e
   `OrdersService#create` (confirmação de pedido, fire-and-forget após a criação). **Gap
   relacionado que também resolvi**: o frontend só tinha a tela de *pedir* o link
   (`/recuperar-senha`) — não existia nenhuma tela pra *consumir* o token e trocar a senha, então
   o link do e-mail cairia num beco sem saída. Criei
   `src/app/(auth)/redefinir-senha/page.tsx` (lê `?token=`, chama
   `POST /auth/reset-password`) e adicionei `authService.resetPassword`/`useAuth().resetPassword`
   que faltavam na camada de serviço/hook do frontend. **Falta pro Sunday**: você mesmo
   adicionar `RESEND_API_KEY` (e opcionalmente `MAIL_FROM`) no `.env` do backend — sem isso o
   fluxo continua funcionando (não quebra nada), só não manda e-mail de verdade.
4. ~~**`/favorites` sem `promotion`**~~ ✅ Resolvido — `favorites.service.ts` agora chama
   `promotionsService.resolveActiveForProducts` igual ao `products.service.ts`, testado e
   confirmado retornando `promotion` populado em `GET /favorites`.
5. ~~**`document` sem validação real**~~ ✅ Resolvido — `UpdateMeDto`/`RegisterDto`/
   `UpdateStoreGroupDto.document` só tinham `@IsString()`, aceitavam qualquer texto. Criei
   `@IsCpfCnpj()` (`src/common/validators/is-cpf-cnpj.validator.ts`, dígito verificador de
   verdade, sem depender de pacote novo) e apliquei nos três. Descoberto assim: um usuário de
   teste ficou com CPF fake (`12345678901`) sem ninguém notar até tentar pagar de verdade no
   Asaas — agora o erro aparece na hora de salvar o perfil, não no meio do checkout.
6. **Cobrança criada no gateway mas perdida localmente se a gravação falhar** (`payments.service.ts
   #createPaymentInternal`) — **bug real de produção, já aconteceu**: o pedido é criado numa
   transaction própria; a cobrança no Asaas é aberta *depois*, fora dela; se `payment.create`/
   `order.update` falhar em seguida (vimos lentidão de alguns segundos no Neon em operações de
   carrinho — mesma classe de problema), a cobrança real já existe no Asaas (SMS já foi mandado
   pro cliente) mas o backend não tem registro nenhum dela — sem `transactionId` salvo, não dá
   pra cancelar/consultar por aqui, só direto no painel do Asaas. Mitiguei com retry (`src/
   common/utils/retry.ts`, 3 tentativas) na gravação local + log alto (`Logger.error`) com
   `orderNumber`/`transactionId` se mesmo assim falhar, pra pelo menos ser rastreável — mas isso
   é só reduzir a chance, não elimina: uma solução completa exigiria idempotência de verdade
   (ex.: salvar o `transactionId` *antes* de chamar o gateway, ou reconciliação via webhook
   independente da resposta síncrona). Vale priorizar isso antes de depender pesado de produção.
7. ~~**Cancelar pedido não cancelava a cobrança no gateway**~~ ✅ Resolvido —
   `orders.service.ts#cancel()`/`#updateStatus()` (transição pra `cancelled`) só atualizavam o
   pedido aqui; um PIX/boleto pendente continuava pagável na Asaas até vencer sozinho. Adicionei
   `PaymentsService.cancelPendingPaymentForOrder(orderId)`, chamado nos dois pontos — best-effort
   (se o gateway recusar, ex. já pago/vencido, só loga e segue, não trava o cancelamento do
   pedido) e atualiza `Order.paymentStatus` junto (esse campo é um snapshot desnormalizado do
   `Payment.status`, ficava dessincronizado sem isso). Testado de ponta a ponta contra a Asaas de
   produção de verdade (criei cobrança real, cancelei pelo pedido, confirmei `status: cancelled`
   tanto no `Payment` quanto na resposta imediata do endpoint).

**As seções 1-17 abaixo já foram conferidas contra o código atual e corrigidas onde tinham ficado
desatualizadas** (o `forgot-password` da seção 2 e a seção 7 inteira de frete estavam descrevendo
o comportamento antigo, pré-Resend/pré-SuperFrete — já corrigido).

### Atualização de 10/setembro — o que mudou desde a última revisão

- **Feed do Instagram na home** — novo, ver seção 13.1 (`GET /instagram/feed`, público).
- **Imagens da home editáveis pelo admin** — `StoreSettings.homepage` (`heroImage`/`campaignImage`),
  ver seção 13. Antes eram hardcoded no frontend.
- **Categoria/marca "recriada" com slug de um item soft-deletado** — antes estourava `500` (conflito
  de índice único no Postgres); agora reativa e sobrescreve os dados. Ver seção 3.
- **Erros do Prisma mapeados pro contrato de erro padrão** — conflito de unicidade, registro não
  encontrado e violação de FK agora voltam como `409`/`404` no formato `{message, code, errors}` em
  vez de vazar um `500` genérico. Ver seção 1.
- **`ASAAS_API_URL`/`SUPERFRETE_API_URL` agora fazem default pra produção**, não mais sandbox — ver
  seção 1. Isso importa pro frontend só indiretamente (é infra do backend), mas explica por que uma
  cobrança criada num ambiente e cancelada depois com a env var trocada dá `401` do gateway — chave
  e URL precisam ser do mesmo ambiente (sandbox+sandbox ou produção+produção).
- **URL de upload agora vem do próprio request**, não de uma env var fixa — sem mudança de contrato
  pro frontend (seção 15), só ficou mais robusto atrás de proxy reverso (Render etc.).

### Atualização de 11/setembro

- **`PATCH /auth/me` agora aceita `acceptMarketing?: boolean`** e `PublicUser` passa a incluir
  `acceptMarketing: boolean` — antes só dava pra definir no cadastro (`RegisterDto`), sem jeito
  nenhum de mudar depois nem de saber o valor atual pelo `GET/PATCH /auth/me`. Ver seção 2. A tela
  "Receber novidades por e-mail" em Conta > Configurações não salvava nada até essa mudança.
- **Newsletter pública, novo** — `POST /newsletter/subscribe` (seção 13.2), sem autenticação,
  captura e-mail de visitante (não precisa de conta). Tabela nova `NewsletterSubscriber`.

---

## 1. Convenções gerais

### Variáveis de ambiente

`.env.example` já está atualizado e é a fonte da verdade — resumo do que cada uma faz:

| Variável | Onde é usada | Obrigatória? |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Prisma/Neon | sim |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | auth | sim |
| `CORS_ORIGIN` | CORS | sim |
| `FRONTEND_URL` | monta o link de `/redefinir-senha?token=...` no e-mail de reset | sim, se for usar o fluxo de reset por e-mail |
| `RESEND_API_KEY`, `MAIL_FROM` | envio de e-mail transacional (Resend) | não — sem ela, e-mails só logam um warning e não bloqueiam nada |
| `PAYMENT_WEBHOOK_SECRET` | valida `X-Webhook-Secret`/`asaas-access-token` no webhook | sim, se for usar Asaas de verdade |
| `ASAAS_API_URL` | só a URL base (sandbox/produção) | não (default **produção**, `https://api.asaas.com/v3`) |
| `SUPERFRETE_API_URL` | só a URL base (sandbox/produção) | não (default **produção**, `https://api.superfrete.com`) |
| `INSTAGRAM_APP_SECRET` | troca/renova o token do feed do Instagram por um long-lived (seção 13.1) | não — sem ela, usa o token colado como está (expira em ~1h se for short-lived) |

**Atenção, mudou**: `ASAAS_API_URL`/`SUPERFRETE_API_URL` faziam default pro sandbox antes; agora o
default é produção. Só configure essas env vars pra usar o sandbox — e nesse caso a chave/token em
`StoreSettings.integrations` também precisam ser os de sandbox (os ambientes são totalmente
separados; chave de um lado batendo na URL do outro → `401`/erro "chave não pertence a este
ambiente").

**Pegadinha**: `ASAAS_API_KEY` **não existe mais como env var** — nem `SUPERFRETE_TOKEN`. A chave
do Asaas e o token da SuperFrete moram em `StoreSettings.integrations` (banco), configuráveis só
via `PATCH /admin/settings/integrations` (seção 13), não no `.env`. Mesma coisa pro cupom de
boas-vindas (`signupPromotion`, seção 13) — não é mais env var, é `StoreSettings` via
`PUT /admin/settings`. Se você for "ajeitar a env com o que falta", esses três **não vão lá**.

- **Base URL**: todas as rotas abaixo, exceto upload de arquivos servidos estaticamente (seção 15),
  ficam sob o prefixo `/api/v1` (`app.setGlobalPrefix('api/v1')`, `src/main.ts`). Local:
  `http://localhost:8000/api/v1`. Sugestão de env var no frontend: `NEXT_PUBLIC_API_URL`
  (já mencionada no README deste backend).
- **Auth**: JWT Bearer no header `Authorization: Bearer <accessToken>`. Access token expira em
  30 min por padrão (`JWT_ACCESS_EXPIRES_IN`); renovar com `POST /auth/refresh` usando o
  `refreshToken` (30d, ou 90d se `rememberMe: true` no login).
- **Carrinho guest**: rotas de `/cart` aceitam usuário anônimo. Sem `Authorization`, o servidor
  cria um carrinho novo e devolve `cart.id`; mande esse valor no header `X-Cart-Id` nas próximas
  chamadas. Ao logar, se `X-Cart-Id` apontar pra um carrinho guest, ele é mesclado no carrinho do
  usuário automaticamente.
- **Idempotência**: `POST /orders` aceita header `Idempotency-Key` — reenviar a mesma chave com o
  mesmo usuário devolve o pedido já criado em vez de duplicar.
- **Erro padrão** (todo erro 4xx/5xx, `src/common/exceptions/api.exception.ts`):
  ```ts
  { message: string, code: string, errors: Record<string, string[]> } // errors só populado em erros de validação
  ```
  `401` → `UNAUTHENTICATED`, `403` → `FORBIDDEN`, `404` → `NOT_FOUND`, `409` → `CONFLICT`,
  `422` → `VALIDATION_ERROR` (ou código de negócio específico, listado por endpoint abaixo).
  **Novo**: erros conhecidos do Prisma também caem nesse formato em vez de vazar um `500` cru —
  violação de índice único (P2002, ex.: slug duplicado) → `409 CONFLICT` com `errors: {campo:
  ['Este valor já está em uso.']}`; registro não encontrado (P2025) → `404 NOT_FOUND`; violação de
  chave estrangeira (P2003/P2014) → `409 CONFLICT`. Isso vale pra qualquer endpoint, não só os
  documentados explicitamente abaixo com esses códigos.
- **Paginação** (query `page` [default 1], `pageSize` [default 20, máx 100]):
  ```ts
  { items: T[], total: number, page: number, pageSize: number, totalPages: number } // totalPages = 0 se total===0
  ```
- **Datas**: ISO 8601 UTC (`Date.toISOString()`). **Moeda**: BRL, números decimais (não string,
  não centavos). **Booleans em query string**: mande a string `"true"` (qualquer outro valor vira
  `false`).

---

## 2. Auth (`/auth`)

| Método | Rota | Auth | Body | Resposta |
|---|---|---|---|---|
| POST | `/auth/register` (201) | — | `RegisterDto` | `AuthSession` |
| POST | `/auth/login` | — | `LoginDto` | `AuthSession` |
| POST | `/auth/logout` (204) | Bearer | — | — |
| POST | `/auth/refresh` | — | `{ refreshToken: string }` | `AuthSession` |
| GET | `/auth/me` | Bearer | — | `PublicUser` |
| PATCH | `/auth/me` | Bearer | `UpdateMeDto` | `PublicUser` |
| POST | `/auth/forgot-password` | — | `{ email: string }` | `{ message: string }` (sempre 200, não revela se o e-mail existe) |
| POST | `/auth/reset-password` | — | `{ token, password, passwordConfirmation }` | `{ message: string }` |
| GET | `/auth/signup-promotion` | — | — | ver abaixo |

`RegisterDto`: `email, password, name` (required), `phone?, document?, birthDate?` (ISO date),
`acceptMarketing?: boolean`, `referralCode?: string` (**aceito mas ainda não usado em nenhuma
lógica** — não existe programa de indicação implementado, não confie nesse campo fazer algo),
**`acceptTerms: true` obrigatório** (senão `422 VALIDATION_ERROR` em `acceptTerms`). E-mail
duplicado → `409 CONFLICT`.

`document` (aqui, em `PATCH /auth/me` e em `StoreSettings.store.document`), quando enviado, é
validado de verdade (CPF de 11 dígitos ou CNPJ de 14, com dígito verificador — com ou sem
máscara): valor com dígito verificador incorreto → `422 VALIDATION_ERROR` em `document`. Não
manda um CPF placeholder tipo `11111111111`/`12345678901`, é rejeitado.

`LoginDto`: `email, password, rememberMe?: boolean`. Credenciais inválidas → `401 INVALID_CREDENTIALS`.

`AuthSession`:
```ts
{ user: PublicUser, accessToken: string, refreshToken: string, expiresAt: string /* ISO, expiração do refresh */ }
```

`PublicUser`:
```ts
{ id, email, name, phone: string|null, document: string|null, avatarUrl: string|null,
  birthDate: string|null, emailVerified: boolean, acceptMarketing: boolean, createdAt, updatedAt }
```

`UpdateMeDto` (`PATCH /auth/me`): `name?, phone?, document?, avatarUrl?, birthDate?` (mesmas regras
do `RegisterDto` acima) **+ `acceptMarketing?: boolean`** — único jeito de mudar essa preferência
depois do cadastro (não existe rota separada tipo `/me/marketing`). Sem enviar o campo, o valor
atual não muda (comportamento padrão de PATCH parcial).

`GET /auth/signup-promotion` — fonte da verdade é `StoreSettings.signupPromotion` (seção 13, editável
pelo admin), **não** env var:
```ts
// se signupPromotion.enabled === false OU expiresAt no passado:
{ success: false, message: "Nenhuma promoção de cadastro ativa no momento." }
// senão:
{ success: true, message: string, couponCode: string, discountPercentage: number }
```

`forgot-password` **envia e-mail de verdade** via Resend (`MailService`, seção 1 — precisa de
`RESEND_API_KEY` configurada, senão só loga um warning e segue sem erro nenhum pro client). O
e-mail linka pra `${FRONTEND_URL}/redefinir-senha?token=<rawToken>` — o frontend precisa ter essa
rota implementada (lê `?token=` da URL e chama `POST /auth/reset-password`).

---

## 3. Catálogo

### Categorias (`/categories`, público)
- `GET /categories?tree=true|false&includeInactive=true|false` (`CategoryQueryDto`, também aceita
  `flat`, sinônimo de `tree=false` sem efeito adicional) — `tree=true` retorna
  `{ items: CategoryTreeResponse[] }` (só raízes, com `children` aninhado); senão
  `{ items: CategoryResponse[] }` (lista flat). `includeInactive=true` inclui categorias com
  `isActive: false` — **atenção**: essa rota é pública, sem `Bearer`, então `includeInactive=true`
  funciona sem autenticação nenhuma (não é um filtro admin protegido; se isso for sensível, use
  `admin/categories`, que é paginado e exige `role=admin`, para telas de administração).
- `GET /categories/:slug` → `CategoryResponse`, 404 se não achar.

```ts
CategoryResponse: { id, slug, name, description, image, parentId: string|null,
  productCount: number /* produtos ativos da categoria + subcategorias */, isActive, sortOrder,
  createdAt, updatedAt }
CategoryTreeResponse extends CategoryResponse { children: CategoryTreeResponse[] }
```

Admin: `admin/categories` — `GET`, `POST` (201), `PUT /:id`, `DELETE /:id` (204, soft-delete via
`isActive=false`). Todas com `Bearer` + `role=admin`. `slug` é único: `POST` com um slug que já
pertence a uma categoria **ativa** → `409 CATEGORY_SLUG_TAKEN`; se pertencer a uma categoria
**inativa** (soft-deletada), reativa e sobrescreve os dados com o que veio no body, em vez de
travar num 409 sem saída — reaproveita o slug em vez de exigir um diferente.

### Marcas (`/brands`, público)
- `GET /brands` → `{ items: BrandResponse[] }` (sem paginação, sem filtros).
- `GET /brands/:slug` → `BrandResponse`, 404 se não achar.

```ts
BrandResponse: { id, slug, name, description: string|null, logo: string|null, website: string|null,
  isActive, createdAt, updatedAt }
```

Admin: `admin/brands` — mesmo padrão CRUD de categorias, incluindo a mesma reativação de slug
inativo descrita acima (`409 BRAND_SLUG_TAKEN` se o slug pertencer a uma marca ativa).

### Produtos (`/products`, público, **auth opcional** via Bearer — se logado, popula `isFavorite`)

- `GET /products` — query `ProductQueryDto`: `page, pageSize, sortBy` (`relevance|price_asc|
  price_desc|newest|bestseller|rating|name_asc|name_desc`, default `relevance`), `categoryIds?:
  string[]`, `brandIds?: string[]`, `priceMin?, priceMax?, ratingMin?: number`, `inStockOnly?,
  isFeatured?, isNew?, isBestseller?, onSale?: boolean`, `search?: string`, `colors?: string[]`.
  Arrays em query string: repita o param (`?categoryIds=a&categoryIds=b`) ou mande um único valor.
  → `PaginatedResponse<ProductResponse>`.
- `GET /products/:slug` → `ProductResponse`, 404 se inativo ou não existir.
- `GET /products/:id/related?limit=8` → `{ items: ProductResponse[] }`.

```ts
ProductResponse: {
  id, slug, name, shortDescription, description,
  ingredients?: string, howToUse?: string, benefits?: string[], technicalInfo?: Record<string,string>,
  brand: BrandResponse, category: CategoryResponse,
  images: { id, url, alt, sortOrder, isPrimary }[],
  variants: { id, sku, name, attributes: Record<string,string>, price: number,
    promotionalPrice?: number, stock: number, image?: string, isAvailable: boolean }[],
  pricing: { priceFrom: number, priceTo: number, promotionalPriceFrom?: number,
    promotionalPriceTo?: number, currency: 'BRL', discountPercentage?: number },
  inventory: { totalStock: number, isInStock: boolean, lowStockThreshold: 5, isLowStock: boolean },
  rating: { average: number, count: number },
  badges: { id, label, type, color?: string }[],
  promotion?: ActivePromotionView,   // ver seção 9 — só tipos direct_discount/flash_sale/buy_x_get_y
  isFavorite: boolean,               // false se anônimo ou se a rota não passar userId (ex.: admin create/update)
  isFeatured, isNew, isBestseller: boolean,
  createdAt, updatedAt,
}
```

Admin: `admin/products` — `GET` (aceita `includeInactive=true`), `POST` (201), `PUT /:id`,
`DELETE /:id` (204, soft-delete). `CreateProductDto`/`UpdateProductDto` incluem `variants[]`
(precisa de ao menos 1, senão `422`), `images[]`, `badges[]`. Agregados (`totalStock`,
`minEffectivePrice`, `maxEffectivePrice`, `hasPromotion`) são recalculados automaticamente a
partir de `variants` — não envie esses campos. **Respostas de create/update do admin não
populam `isFavorite`/`promotion`** (sempre `false`/`undefined`).

---

## 4. Endereços (`/addresses`, Bearer obrigatório)

| Método | Rota | Body/Resposta |
|---|---|---|
| GET | `/addresses` | `{ items: AddressResponse[] }` (ordenado: default primeiro, depois mais recente) |
| GET | `/addresses/:id` | `AddressResponse`, 404 se não for do usuário |
| POST | `/addresses` (201) | `UpsertAddressDto` → `AddressResponse` |
| PUT / PATCH | `/addresses/:id` | `UpdateAddressDto` (parcial) → `AddressResponse` |
| DELETE | `/addresses/:id` (204) | — |
| POST | `/addresses/:id/default` | → `AddressResponse` |

```ts
AddressResponse: { id, userId, label: string|null, recipientName, street, number,
  complement: string|null, neighborhood, city, state, zipCode, country /* default "BR" */,
  phone: string|null, isDefault, createdAt, updatedAt }
```
Primeiro endereço criado vira `isDefault` automaticamente. Marcar outro como default desmarca o
anterior. Apagar o default promove o mais recente restante.

---

## 5. Carrinho (`/cart`, **auth opcional** — ver convenção de guest cart na seção 1)

| Método | Rota | Body |
|---|---|---|
| GET | `/cart` | — |
| POST | `/cart/items` | `{ productId, variantId, quantity }` |
| PATCH | `/cart/items/:itemId` | `{ quantity }` |
| DELETE | `/cart/items/:itemId` | — |
| DELETE | `/cart` | — (esvazia) |
| POST | `/cart/coupon` | `{ code }` |
| DELETE | `/cart/coupon` | — |
| PUT | `/cart/shipping` | `{ shippingOptionId, zipCode }` |

Todas retornam `CartResponse`, exceto `POST /cart/coupon` que retorna `{ cart: CartResponse,
validation: CouponValidationResult }` (ver seção 6).

```ts
CartResponse: {
  id: string,
  items: { id, productId, productSlug, productName, variantId, variantSku, variantName,
    attributes: Record<string,string>, image, unitPrice: number, promotionalPrice?: number,
    quantity: number, maxQuantity: number /* min(estoque, 10) */, isAvailable: boolean,
    lineTotal: number }[],
  totals: { subtotal, discount, shipping, tax: 0, total, itemCount, currency: 'BRL' },
  couponCode?: string,
  freeShipping: boolean,
  couponMessage?: string,
  rewardEligibleAmount: number,   // subtotal - discount, usar em GET /rewards/progress?eligibleAmount=
  shippingOptionId?: string,
  updatedAt: string,
}
```
Estoque insuficiente ao adicionar/atualizar item → `409 STOCK_UNAVAILABLE` /
`422 VALIDATION_ERROR` (quantidade acima do estoque). Cupom que deixa de valer (ex.: carrinho
mudou) é removido automaticamente no próximo `GET /cart` — não fica em estado inconsistente.
Limite de 10 unidades por item (`STORE_MAX_QTY`), aplicado silenciosamente (sem erro).

---

## 6. Cupons

- `POST /coupons/validate` — público, **auth opcional**. Body: `{ code, cartSubtotal, productIds?,
  categoryIds? }`. → `CouponValidationResult` (mesmo shape usado internamente em pedidos):
  ```ts
  { status: 'valid'|'invalid'|'expired'|'not_started'|'usage_limit_reached'|'min_order_not_met'|
      'not_applicable'|'already_used'|'inactive',
    coupon?: CouponResponse, discountAmount: number, message: string }
  ```
- `GET /coupons/:code` — público → `CouponResponse`, 404 se não achar.
- `GET /me/coupons` — Bearer → `{ items: CouponResponse[] }` (cupons ativos elegíveis pro usuário,
  considerando `perUserLimit`/`firstPurchaseOnly`).

```ts
CouponResponse: { id, code, type: 'percentage'|'fixed_amount'|'free_shipping'|'category'|'product',
  value: number, description?: string, categoryIds?: string[], productIds?: string[],
  minOrderValue?: number, maxDiscountValue?: number, usageLimit?: number, usageCount: number,
  perUserLimit?: number, startsAt, endsAt, isActive, createdAt, updatedAt }
```

Admin: `admin/coupons` — CRUD padrão (`GET`, `POST` 201, `PUT /:id`, `DELETE /:id` 204 soft-delete).
`code` é normalizado pra uppercase automaticamente.

**Importante para o checkout**: o consumo de cupom (`usageCount`, `already_used` por usuário) só
acontece quando o pagamento é confirmado (webhook `paid`) — nunca na criação do pedido nem na
aplicação no carrinho.

---

## 7. Frete (`/shipping`)

### `POST /shipping/quote` — público
```ts
// Body — ATENÇÃO: `items` é obrigatório (mín. 1), diferente do que uma versão anterior deste doc dizia
{
  zipCode: string,
  items: { productId: string, variantId: string, quantity: number,
    weightGrams?: number, widthCm?: number, heightCm?: number, lengthCm?: number }[],
  subtotal?: number,
}
```
```ts
// Resposta
{ zipCode: string /* 8 dígitos, sem máscara */, quotedAt: string,
  options: { id: string, provider: string, serviceName: string, serviceCode: string,
    price: number, currency: 'BRL', estimatedDaysMin: number, estimatedDaysMax: number,
    isFree: boolean }[] }
```
CEP inválido (≠ 8 dígitos após remover não-dígitos) → `422 INVALID_ZIP_CODE`. `items` vazio →
`422 VALIDATION_ERROR`. `weightGrams`/`*Cm` por item são opcionais — se omitidos, usa o pacote
padrão configurado em `StoreSettings.shipping` (seção 13); não há peso/dimensão por produto no
banco ainda, então na prática quase sempre cai no default da loja mesmo informando cada item.

### Dois modos, escolhidos por `StoreSettings.integrations.shippingProvider` (admin, seção 13)

- **`"mock"` (padrão)** — 3 opções fixas, **`id` estável**: `ship-pac` (Correios PAC, grátis acima
  de R$149), `ship-sedex` (Correios SEDEX, grátis acima de R$249), `ship-expressa` (SuperFrete,
  nunca grátis).
- **`"superfrete"` com `integrations.superfreteToken` configurado** — cotação real via API da
  SuperFrete (`POST /api/v0/calculator`). **`id` é dinâmico**: `` `sf-${serviceId}` `` (ex.:
  `sf-1` = Correios PAC, `sf-2` = Correios SEDEX — os únicos serviços cotados hoje), preço e prazo
  vêm da resposta deles em tempo real. Se a chamada falhar por qualquer motivo (token inválido,
  erro de rede, resposta sem opção válida), **cai automaticamente pro mock acima** — nunca quebra
  o checkout, só loga um warning no servidor.

**Não hardcode `ship-pac`/`ship-sedex`/`ship-expressa` no frontend** — sempre use o `id` que veio
na resposta do `POST /shipping/quote` mais recente, porque pode ser um `sf-N` dependendo da
configuração do admin no momento.

`PUT /cart/shipping` e `POST /orders` **não mudaram** — seus bodies continuam só `{
shippingOptionId, zipCode }` e `{ ..., shippingOptionId }` respectivamente (sem `items`); o
backend já sabe os itens do carrinho/pedido e recalcula o preço sozinho com a mesma lógica acima
antes de gravar — nunca confia no preço que a tela mostrou no `quote()`.

**Não implementado no backend**: `POST /shipping/shipments` (criar remessa / comprar etiqueta),
`GET /shipping/tracking/:code`, cancelamento de remessa. `Order.trackingCode`/`trackingUrl` só são
preenchidos manualmente pelo admin hoje (`PATCH /admin/orders/:id/status`). Não implemente
`ShippingRepository.createShipment/getTracking/cancelShipment` no frontend até o backend expor
essas rotas.

---

## 8. Favoritos (`/favorites`, Bearer obrigatório — sem modo anônimo)

| Método | Rota | Resposta |
|---|---|---|
| GET | `/favorites?page&pageSize&sortBy` | `PaginatedResponse<ProductResponse>` |
| GET | `/favorites/ids` | `{ ids: string[] }` |
| GET | `/favorites/:productId/check` | `{ isFavorite: boolean }` |
| POST | `/favorites/:productId` (204) | — (idempotente) |
| DELETE | `/favorites/:productId` (204) | — (idempotente) |

`GET /favorites` só lista produtos `isActive: true`; cada item tem `isFavorite: true` fixo, mas
**`promotion` sempre vem `undefined`** nessa rota especificamente (gap conhecido — o backend não
busca promoções ativas ao montar essa lista; se a home/vitrine depende de `product.promotion` pra
mostrar badge de desconto, essa tela de favoritos não vai mostrar). `POST` com produto inexistente
→ `404 NOT_FOUND`.

---

## 9. Promoções (`/promotions`, público — campanhas de catálogo, diferente de cupom)

- `GET /promotions?activeOnly=true|false&type=...` → `{ items: PromotionResponse[] }`,
  `activeOnly` default `true` (omitir o param também filtra só ativas — só manda tudo se
  `activeOnly=false` explicitamente). **Atenção**: essa rota é pública, sem `Bearer` — igual
  `/categories` (seção 3), `activeOnly=false` funciona sem autenticação, expondo promoções
  inativas/futuras pra qualquer visitante; pra tela de admin use `admin/promotions` (paginado,
  exige `role=admin`).
- `GET /promotions/:slug` → `PromotionResponse`, 404 se não achar.
- `POST /promotions/preview` (200) — Body: `{ items: { productId, variantId, quantity }[] }`
  (ex.: itens do carrinho). → simula quais promoções se aplicariam:
  ```ts
  { discountAmount: number, appliedPromotionIds: string[],
    lines: { productId, variantId, unitEffectivePrice: number, lineDiscount: number }[] }
  ```

```ts
PromotionResponse: { id, slug, name, description, type: 'direct_discount'|'buy_x_get_y'|
  'progressive'|'flash_sale'|'kit'|'campaign', discountPercentage?: number, discountAmount?: number,
  buyXGetY?: { buyQuantity, getQuantity, applyToCheapest: boolean, getDiscountPercentage: number },
  progressiveTiers?: { minQuantity, discountPercentage }[],
  kitItems?: { productId, variantId?, quantity }[], kitPrice?: number,
  productIds?: string[], categoryIds?: string[], brandIds?: string[], bannerImage?: string,
  startsAt, endsAt, isActive, priority: number, createdAt, updatedAt }

ActivePromotionView (o que aparece em product.promotion): {
  id, label: string /* = promotion.name */, type: 'percentage'|'fixed_amount'|'buy_x_get_y'|'flash_sale',
  value: number, startsAt, endsAt, isActive }
```

**Atenção**: `product.promotion` (catálogo) só considera 3 dos 6 tipos (`direct_discount`,
`flash_sale`, `buy_x_get_y`) — `progressive`, `kit` e `campaign` nunca aparecem ali, só via
`POST /promotions/preview` no carrinho/checkout. `campaign` não dá desconto nenhum (é só
banner/editorial).

Admin: `admin/promotions` — CRUD padrão, mesmo shape de `PromotionResponse` no body de
create/update (`UpsertPromotionDto`/`UpdatePromotionDto`).

---

## 10. Recompensas (`/rewards`, público — auth opcional em `progress`)

- `GET /rewards/tiers` → `{ items: RewardTierResponse[] }`, só ativas, ordenadas por `sortOrder`.
- `GET /rewards/progress?eligibleAmount=123.45` — se omitir `eligibleAmount`, calcula do carrinho
  do usuário/guest (precisa do mesmo mecanismo de auth opcional + `X-Cart-Id` do carrinho; mais
  simples: sempre mande `eligibleAmount = cart.rewardEligibleAmount` que já vem em `GET /cart`).
  ```ts
  { cartEligibleAmount: number, currentReward?: RewardTierResponse, nextReward?: RewardTierResponse,
    amountRemaining: number, progressPercentage: number /* 0-100 */, isUnlocked: boolean }
  ```

```ts
RewardTierResponse: { id, minimumAmount: number, isActive, sortOrder,
  reward: { id: string /* == tier.id, não é um id separado */, name, description, image } }
```

Admin: `admin/reward-tiers` — CRUD padrão. `minimumAmount` duplicado entre tiers ativos →
`409 REWARD_TIER_DUPLICATE_MINIMUM`.

O brinde é congelado no pedido no momento da criação (`Order.rewardTierId`/`rewardGift`, ver
seção 11) — não recalcula depois.

---

## 11. Checkout / Pedidos (`/orders`, Bearer obrigatório)

### `POST /orders` (201)
Header opcional `Idempotency-Key`.
```ts
// Body (CreateOrderRequest)
{
  items: { productId: string, variantId: string, quantity: number }[],  // mín. 1
  shippingAddressId: string,
  billingAddressId?: string,
  shippingOptionId: string,        // um dos ids de POST /shipping/quote
  paymentMethod: 'credit_card'|'debit_card'|'pix'|'boleto'|'wallet'|'store_credit',
  couponCode?: string,
  notes?: string,
}
```
**O backend nunca confia em preço/frete vindos do client** — recalcula tudo a partir do
`variantId` (preço/estoque atuais), do `couponCode` (revalida do zero) e do `shippingOptionId`
(recotação via `shipping.service`). Reserva de estoque é imediata (decremento na criação, dentro
de uma transaction) — não é "soft hold" separado.

Resposta:
```ts
{ order: Order, payment?: Payment }
```
`payment` só vem preenchido se `paymentMethod` for `pix` ou `boleto` (cobrança automática — ver
seção 12). Para `credit_card`, o pedido nasce sem `payment`; o frontend precisa chamar
`POST /payments` **logo em seguida**, com o `order.id` e o `creditCardToken` (seção 12.3).

Erros: `404` (endereço ou `shippingOptionId` inválidos), `409`/`422 STOCK_UNAVAILABLE`,
`422 COUPON_*` (mesmos códigos da seção 6), `422 VALIDATION_ERROR` (pedido sem itens).

Em caso de sucesso, um e-mail de confirmação é disparado pro usuário (fire-and-forget, via
`MailService` — nunca falha nem atrasa a resposta de `POST /orders`, mesmo sem
`RESEND_API_KEY` configurada).

### Outras rotas
| Método | Rota | Resposta |
|---|---|---|
| GET | `/orders?page&pageSize&status` | `PaginatedResponse<Order>` — só pedidos do usuário logado |
| GET | `/orders/:id` | `Order` — dono ou admin; senão `403 FORBIDDEN` |
| GET | `/orders/by-number/:orderNumber` | `Order` — só dono (404 se não for) |
| POST | `/orders/:id/cancel` | Body `{ reason?: string }` → `Order` |

Cancelamento só permitido se `status ∈ {pending_payment, paid, processing}`, senão
`422 ORDER_NOT_CANCELLABLE`. Cancelar devolve o estoque reservado **e** tenta cancelar qualquer
pagamento `pending` associado no gateway (Pix/boleto ainda não pagos) — best-effort: se o gateway
recusar (ex.: já foi pago do lado deles), só loga e segue, o pedido cancela normalmente mesmo
assim. `Order.paymentStatus` na resposta já reflete isso.

```ts
Order: {
  id, orderNumber: string /* "HA-2026-0001" */, userId, status: OrderStatus,
  items: { id, productId, productSlug, productName, variantId, variantSku, variantName,
    attributes: Record<string,string>, image, unitPrice: number, promotionalPrice?: number,
    quantity, lineTotal: number }[],
  shippingAddress: AddressResponse,   // snapshot no momento do pedido, não muda se o endereço original mudar depois
  billingAddress?: AddressResponse,
  subtotal, discount, shipping, tax: 0, total: number, currency: 'BRL',
  couponCode?: string,
  paymentMethod: PaymentMethod, paymentStatus: PaymentStatus, paymentId?: string,
  shippingOptionId?: string, trackingCode?: string, trackingUrl?: string, notes?: string,
  rewardTierId?: string,
  rewardGift?: { id: string, name: string, description: string, image: string },  // snapshot, presente se um tier foi conquistado na criação
  createdAt, updatedAt,
  paidAt?, shippedAt?, deliveredAt?, cancelledAt?: string,
}

type OrderStatus = 'pending_payment'|'paid'|'processing'|'shipped'|'in_transit'|'delivered'|
  'cancelled'|'refunded'|'returned'
```

### Máquina de estados (`PATCH /admin/orders/:id/status` valida isto — ver seção 14)
```
pending_payment → paid | cancelled
paid            → processing | cancelled | refunded
processing      → shipped | cancelled | refunded
shipped         → in_transit | delivered | returned
in_transit      → delivered | returned
delivered       → returned | refunded
returned        → refunded
cancelled, refunded → (terminais)
```

---

## 12. Pagamentos (`/payments`, Bearer obrigatório; webhook é público)

### 12.1 Gateway ativo

O gateway é escolhido **em runtime**, por `StoreSettings.integrations.paymentGateway` (seção 13,
editável pelo admin sem redeploy) — `"mock"` (padrão, sem credenciais reais) ou `"asaas"`. O
frontend não escolhe o gateway; sempre fala com `POST /payments` do jeito abaixo, seja qual for o
gateway ativo no momento.

### `POST /payments`
```ts
// CreatePaymentRequest
{
  orderId: string, method: PaymentMethod, amount: number, currency: 'BRL',
  card?: { token: string, installments: number, holderName: string, brand?: string, lastFourDigits?: string },
  pix?: { expiresInSeconds?: number },
  returnUrl?: string, metadata?: Record<string,string>,
}
```
`amount` precisa bater com `order.total` (±R$0,01), senão `422 PAYMENT_AMOUNT_MISMATCH` — sempre
mande o `total` que veio em `Order`, nunca um valor calculado no frontend. Reenviar
`POST /payments` pro mesmo pedido enquanto o pagamento anterior ainda estiver `pending` devolve
o **mesmo** `Payment` (idempotente), não cria um novo.

```ts
Payment: { id, orderId, method: PaymentMethod, status: PaymentStatus, amount: number, currency: 'BRL',
  pixQrCode?: string, pixQrCodeUrl?: string /* pode ser data:image/png;base64,... com Asaas — renderiza direto num <img> */,
  pixExpiresAt?: string, boletoUrl?: string, boletoBarcode?: string, redirectUrl?: string,
  transactionId?: string, refundedAmount?: number, createdAt: string }

type PaymentStatus = 'pending'|'processing'|'authorized'|'paid'|'failed'|'cancelled'|'refunded'|'partially_refunded'
```

| Método | Rota | Auth | Resposta |
|---|---|---|---|
| GET | `/payments/:id` | dono do pedido ou admin | `Payment` |
| POST | `/payments/:id/cancel` | dono (só se `status='pending'`) ou admin | `Payment` |
| POST | `/payments/:id/refund` | **admin apenas** | Body `{ amount?: number }` (omitido = total) → `Payment` |

Cancelar pagamento não-`pending` → `422 PAYMENT_NOT_CANCELLABLE`. Reembolsar pagamento que não
está `paid`/`partially_refunded` → `422 PAYMENT_NOT_REFUNDABLE`.

### 12.2 Pix e boleto — fluxo automático
Se `Order.paymentMethod` for `pix` ou `boleto`, `POST /orders` já abre a cobrança e devolve
`payment` preenchido na mesma resposta — **não é preciso chamar `POST /payments` depois** nesse
caso (só se quiser tentar de novo após falha/expiração).

### 12.3 Cartão de crédito — tokenização (`POST /payments/tokenize-card`)

**Correção importante**: a versão anterior deste doc dizia que `card.token` vinha de um "Asaas.js"
tokenizado no navegador. **Isso não existe** — conferi a documentação oficial do Asaas
(https://docs.asaas.com/reference/tokenizacao-de-cartao-de-credito e
https://docs.asaas.com/docs/sdks): o único SDK deles é Java (servidor), e tanto a tokenização
quanto a criação de cobrança exigem o header `access_token` — a chave **secreta** do lojista, que
nunca pode ir pro navegador. Não existe chave pública/publishable key nem SDK client-side (ao
contrário de Stripe.js, SDK do Mercado Pago ou pagarme.js).

Por isso a tokenização acontece **aqui no backend**, autenticada com a `access_token`, e o PAN só
passa em trânsito por essa rota — nunca é persistido, só o `creditCardToken` resultante é salvo
(no `Payment`, via `card.brand`/`card.lastFourDigits`).

```ts
// POST /payments/tokenize-card — Bearer obrigatório
// Body (TokenizeCardDto)
{
  holderName: string, number: string, expiryMonth: string /* "MM" */, expiryYear: string /* "AAAA" */,
  ccv: string, postalCode: string, addressNumber: string, addressComplement?: string,
}
```
Nome/e-mail/CPF/telefone do titular **não vão no body** — vêm do perfil do usuário autenticado
(mesma resolução de `customer` que `POST /payments` já usa; se o usuário não tiver `document`
cadastrado, `422 CUSTOMER_DOCUMENT_REQUIRED`). `postalCode`/`addressNumber` são do endereço de
cobrança escolhido no checkout — o frontend manda o que tiver, mas se ele não tiver endereço
nenhum ainda (ex.: primeiro passo do checkout), a chamada falha porque esses campos são
obrigatórios; não há fallback pro CEP da loja ou algo assim.

Resposta (`201`):
```ts
{ token: string /* creditCardToken do Asaas */, brand?: string, lastFourDigits?: string }
```
Manda esse `token` em `card.token` do `POST /payments` normal (seção acima), junto com
`installments`/`holderName` que o frontend já tinha.

No gateway `mock`, cartão terminado em `"0002"` gera um token que faz `POST /payments` recusar
(`status: 'failed'`) — convenção pra testar o fluxo de recusa sem o Asaas real. Implementado em
`src/payments/gateways/{asaas,mock}-payment.gateway.ts` + `payments.controller.ts`. **Testado**
com `paymentGateway: "mock"` (aprovado e recusado, ponta a ponta via checkout real) — **não
testado ainda contra o Asaas sandbox/produção**.

### `POST /webhooks/payments/:gateway` — **não é o frontend quem chama isso**
Rota pública (sem JWT), chamada pelo próprio Asaas/gateway quando o pagamento muda de status.
Mencionado aqui só pra contexto — não precisa de nenhuma implementação no frontend.

---

## 13. Configurações da loja (`/settings`)

### `GET /settings` — público
```ts
{
  store: { name: string, email: string, phone?: string, instagramUrl?: string },
  checkout: { enabledPaymentMethods: string[], maxInstallments: number },
  rewards: { enabled: boolean },
  signupPromotion: { enabled: boolean, couponCode: string, discountPercentage: number,
    message: string, expiresAt?: string },
  homepage: { heroImage: string, campaignImage: string },  // novo — ver seção 13.1/abaixo
  currency: 'BRL',
}
```

### Admin (`admin/settings`, Bearer + role admin)
- `GET /admin/settings` → objeto completo `StoreSettings` abaixo, com `integrations.asaasApiKey`
  e `integrations.superfreteToken` **mascarados** (ver regra abaixo) — nunca vêm em texto puro
  por HTTP.
- `PUT /admin/settings` — body com qualquer subconjunto de `{ store?, checkout?, shipping?,
  rewards?, homepage?, signupPromotion?, currency?, timezone? }` (merge profundo por grupo — só
  sobrescreve os campos enviados). **`integrations` não faz parte deste body.** `homepage` é novo:
  `{ heroImage?: string, campaignImage?: string }` — URLs de imagem (normalmente resultado de
  `POST /admin/uploads`, seção 15) para o banner principal e o banner de campanha da home.
- `PATCH /admin/settings/integrations` — único jeito de mexer em `integrations`. Body:
  `{ paymentGateway?: string, asaasApiKey?: string, shippingProvider?: string,
  superfreteToken?: string, instagramAccessToken?: string, instagramUserId?: string }`
  (substituição direta desses campos, sem merge). Resposta:
  `{ paymentGateway, shippingProvider, asaasApiKey: string|undefined /* mascarado */,
  superfreteToken: string|undefined /* mascarado */, instagramUserId: string|undefined,
  instagramAccessToken: string|undefined /* mascarado */, updatedAt }`. Colar um
  `instagramAccessToken` novo reseta o controle interno de renovação (seção 13.1) — o próximo
  request ao feed troca esse token por um long-lived antes de usar.

```ts
StoreSettings: {
  store: { name, legalName?, document?, email, phone?, instagramUrl? },
  checkout: { enabledPaymentMethods: string[], maxInstallments: number, minInstallmentAmount: number,
    allowGuestCheckout: boolean },
  shipping: { originZipCode, defaultWeightGrams, defaultWidthCm, defaultHeightCm, defaultLengthCm,
    freeShippingThresholds: { PAC?: number|null, SEDEX?: number|null, EXPRESSA?: number|null } },
  rewards: { enabled: boolean },
  homepage: { heroImage: string, campaignImage: string },
  signupPromotion: { enabled, couponCode, discountPercentage, message, expiresAt? },
  integrations: { paymentGateway: string, shippingProvider: string, asaasApiKey?: string,
    superfreteToken?: string, instagramUserId?: string, instagramAccessToken?: string,
    instagramTokenRefreshedAt?: string /* só leitura — gerenciado pelo backend, ver 13.1 */ },
  currency: 'BRL', timezone: string, updatedAt: string,
}
```

**Regra de mascaramento**: valor vazio → `undefined` no JSON; senão `` `${prefixo}_****` ``
(prefixo = parte antes do primeiro `_`, ou 4 primeiros caracteres se não tiver `_`). Ex.:
`asaas_prod_abc123` → `asaas_****`. Não dá pra recuperar o valor completo por HTTP — se a tela de
admin precisar confirmar "chave já configurada", use só a presença/ausência do campo, não tente
mostrar o valor mascarado como se fosse editável.

### 13.1 Feed do Instagram (`/instagram`, público)

- `GET /instagram/feed` → `{ items: InstagramMediaItem[] }` (até 6 itens, mais recentes primeiro).
  ```ts
  InstagramMediaItem: { id: string, imageUrl: string, permalink: string, caption?: string }
  ```
- Sem `Bearer`, sem paginação. Se `integrations.instagramUserId` não estiver configurado, ou a
  chamada à Meta falhar por qualquer motivo, devolve `{ items: [] }` (ou o último resultado em
  cache, se houver) — **nunca lança erro**, o feed é decorativo. Se `items` vier vazio, não
  renderize a seção "Comunidade" na home.
- Cache interno de 30min no backend (evita estourar o limite de requisições da Meta) — não
  precisa (nem adianta) o frontend cachear além do normal do React Query.
- Configuração é toda feita pelo admin: `instagramUserId`/`instagramAccessToken` via
  `PATCH /admin/settings/integrations` (acima). O backend cuida sozinho de trocar/renovar o token
  por um long-lived — o frontend não participa desse fluxo, só lê `GET /instagram/feed`.

### 13.2 Newsletter (`/newsletter`, público)

- `POST /newsletter/subscribe` — Body: `{ email: string }` → `200 { message: string }`.
- Sem `Bearer` — qualquer visitante pode assinar, não precisa ter conta (isso é intencional e
  diferente de `User.acceptMarketing`, que é a preferência de quem já tem cadastro, seção 2).
- **Idempotente**: assinar de novo com o mesmo e-mail não dá erro — sempre `200` com a mesma
  mensagem de sucesso, mesmo se o e-mail já estiver na lista. `email` inválido → `422
  VALIDATION_ERROR`.
- Persistido em `NewsletterSubscriber` (`id, email` único, `createdAt`) — sem rota de listagem
  admin ainda (se precisar exportar a lista, hoje só direto no banco).
- Dispara um e-mail de confirmação via `MailService` (fire-and-forget do ponto de vista do
  frontend, mas `await`ado aqui dentro — mesmo assim nunca lança: sem `RESEND_API_KEY`
  configurada, só loga e a resposta `200` sai normal).

---

## 14. Admin — dashboard, clientes e pedidos

CRUD de categorias/marcas/produtos/cupons/promoções/reward-tiers já cobertos nas seções
respectivas (todos `Bearer` + `role=admin`, mesmo padrão `GET` lista paginada / `POST` 201 /
`PUT :id` / `DELETE :id` 204 soft-delete).

### `GET /admin/dashboard?from&to` (ISO date, default: últimos 30 dias)
```ts
{
  period: { from: string, to: string },           // YYYY-MM-DD
  ordersCount: number, ordersPaidCount: number,     // paid|processing|shipped|in_transit|delivered
  revenue: number, averageTicket: number,
  newCustomers: number, productsLowStock: number,   // ativos com 0 < totalStock <= 5
  ordersByStatus: Record<OrderStatus, number>,
  topProducts: { productId: string, name: string, unitsSold: number }[],  // top 10
}
```

### `GET /admin/customers?page&pageSize&search`
`search` filtra por `name`/`email` (contains, case-insensitive). →
`PaginatedResponse<PublicUser & { ordersCount: number }>`.

### `GET /admin/customers/:id` → `PublicUser & { ordersCount: number }`, 404 se não for `role=customer`.

### Pedidos admin (`admin/orders`)
| Método | Rota | Query/Body |
|---|---|---|
| GET | `/admin/orders?page&pageSize&status&search&from&to` | `search` = orderNumber ou e-mail |
| GET | `/admin/orders/:id` | — |
| PATCH | `/admin/orders/:id/status` | `{ status, trackingCode?, trackingUrl?, notes? }` |
| POST | `/admin/orders/:id/refund` | `{ amount? }` → `Payment` (não `Order`) |

`PATCH .../status` valida contra a máquina de estados da seção 11 — transição fora da tabela →
`422 INVALID_STATUS_TRANSITION`. Ao transicionar pra `cancelled`, o estoque é devolvido
automaticamente (outras transições não mexem em estoque).

---

## 15. Upload de imagens (`admin/uploads`, Bearer + role admin)

- `POST /api/v1/admin/uploads` — `multipart/form-data`, campo `file` (só esse nome). Máx **5MB**,
  só `image/*`. → `201 { url: string, mimeType: string, size: number }`.
  `url` já é absoluta (`http://<host>/uploads/<uuid>.<ext>`). Erros de validação →
  `422 VALIDATION_ERROR` (`{ file: [...] }`).
- **Arquivos servidos fora do prefixo `/api/v1`**: a URL retornada é `<host>/uploads/arquivo.ext`,
  não `<host>/api/v1/uploads/arquivo.ext` — não adicione o prefixo da API na hora de exibir a
  imagem.
- `<host>` vem do próprio request (`req.protocol` + `req.get('host')`, com `trust proxy` ligado no
  Express) — funciona certo atrás de proxy reverso (Render etc.) sem nenhuma env var de URL base
  pra manter sincronizada com o domínio real.
- Storage é **disco local** do servidor (não S3) — em produção isso significa que uploads não
  sobrevivem a um redeploy/restart do container a menos que haja um volume persistente montado;
  vale saber disso antes de depender pesado dessa rota em produção.

---

## 16. Divergências conhecidas vs. `hello-ana-make-frontend/docs/*.md`

- **`docs/10-pagamentos.md`** fala em webhook "autenticado por assinatura do gateway" de forma
  genérica — na prática é um segredo compartilhado simples (`PAYMENT_WEBHOOK_SECRET`), não
  relevante pro frontend de qualquer forma (webhook não é chamado por ele).
- **`docs/README.md`** (blueprint original) descreve um backend **Laravel** — o backend real é
  **NestJS**. Contrato HTTP/JSON é o mesmo, mas não existe nada Laravel-específico (rotas,
  formato de erro, paginação — tudo já é o que está documentado aqui).
- **Reward gift no pedido**: `docs/09-checkout-pedidos.md` sugeria `rewardTierId`/`rewardGift`
  como "campos extras sugeridos" — o backend implementou exatamente isso (seção 11). ✅ Resolvido
  — `contracts/order.contract.ts` do frontend já inclui os dois campos.
- **`ShippingRepository.createShipment/getTracking/cancelShipment`**: sem endpoint no backend
  ainda (seção 7) — pendência real, ver "O que falta neste backend" na seção 0.
- **`/favorites` sem `promotion`**: ✅ Resolvido — `favorites.service.ts` já chama
  `promotionsService.resolveActiveForProducts`, `GET /favorites` retorna `promotion` populado.
- **Tokenização de cartão via "Asaas.js"** (`docs/10-pagamentos.md`): a premissa de tokenização
  client-side nunca foi possível com o Asaas real (seção 12.3) — o doc original partiu de uma
  suposição errada sobre como o gateway funciona. ✅ Resolvido com `POST
  /payments/tokenize-card`, implementado neste backend.

---

## 17. Referência rápida de todas as rotas

```
Auth            POST /auth/register · POST /auth/login · POST /auth/logout · POST /auth/refresh
                GET/PATCH /auth/me · POST /auth/forgot-password · POST /auth/reset-password
                GET /auth/signup-promotion

Catálogo        GET /categories[?tree] · GET /categories/:slug
                GET /brands · GET /brands/:slug
                GET /products[?...] · GET /products/:slug · GET /products/:id/related

Endereços       GET/POST /addresses · GET/PUT/PATCH/DELETE /addresses/:id · POST /addresses/:id/default

Carrinho        GET/DELETE /cart · POST /cart/items · PATCH/DELETE /cart/items/:itemId
                POST/DELETE /cart/coupon · PUT /cart/shipping

Cupons          POST /coupons/validate · GET /coupons/:code · GET /me/coupons

Frete           POST /shipping/quote

Favoritos       GET /favorites[?...] · GET /favorites/ids · GET /favorites/:productId/check
                POST/DELETE /favorites/:productId

Promoções       GET /promotions[?...] · GET /promotions/:slug · POST /promotions/preview

Recompensas     GET /rewards/tiers · GET /rewards/progress[?eligibleAmount]

Instagram       GET /instagram/feed

Newsletter      POST /newsletter/subscribe

Pedidos         POST /orders · GET /orders[?...] · GET /orders/:id
                GET /orders/by-number/:orderNumber · POST /orders/:id/cancel

Pagamentos      POST /payments · POST /payments/tokenize-card · GET /payments/:id
                POST /payments/:id/cancel · POST /payments/:id/refund [admin]

Settings        GET /settings

Admin           /admin/categories · /admin/brands · /admin/products · /admin/coupons
                /admin/promotions · /admin/reward-tiers · /admin/orders[/:id/status|/:id/refund]
                /admin/settings[/integrations] · /admin/dashboard · /admin/customers[/:id]
                POST /admin/uploads

Todas as rotas /admin/* exigem Bearer + role=admin (JwtAuthGuard + RolesGuard).
```
