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
| Admin (parcial) | `14-admin.md` | ✅ CRUD de produtos/categorias/marcas · ⏳ dashboard, pedidos, uploads |

**Ainda não implementado** (próximas fases — ver "Como continuar" abaixo): carrinho, cupons,
promoções, recompensas, frete, checkout/pedidos, pagamentos, endereços, favoritos, configurações
da loja, dashboard admin, upload de imagens.

---

## Stack

- **NestJS 10** (TypeScript) — módulos: `auth`, `categories`, `brands`, `products`
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

---

## Como continuar (próximos domínios, na ordem sugerida)

Cada um tem seu contrato detalhado em `hello-ana-make-frontend/docs/`:

1. **Endereços** (`12-enderecos.md`) — CRUD simples, pré-requisito do checkout.
2. **Carrinho** (`04-carrinho.md`) — guest via `X-Cart-Id` + merge no login.
3. **Cupons** (`05-cupons.md`) e **Recompensas** (`07-recompensas.md`).
4. **Frete** (`08-frete.md`) — abstrair `ShippingProvider`, stub local antes de integrar SuperFrete.
5. **Checkout/Pedidos** (`09-checkout-pedidos.md`) e **Pagamentos** (`10-pagamentos.md`).
6. **Favoritos** (`13-favoritos.md`) — depois disso, atualizar `isFavorite` no mapper de produtos.
7. **Promoções** (`06-promocoes.md`) — depois, popular `Product.promotion`.
8. **Configurações da loja** (`15-configuracoes.md`) e restante do **Admin** (`14-admin.md`):
   dashboard, pedidos, upload de imagens.

Padrões já estabelecidos para seguir nos próximos módulos: DTOs com `class-validator`, mapper
`toXResponse` separado do service, exceptions via `src/common/exceptions`, paginação via
`paginate()`, guards `JwtAuthGuard`/`RolesGuard` + `@Roles('admin')` nas rotas administrativas.
