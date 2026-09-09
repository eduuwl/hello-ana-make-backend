import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { StoreSettings } from '../settings/settings.types';

export interface InstagramMediaItem {
  id: string;
  imageUrl: string;
  permalink: string;
  caption?: string;
}

interface InstagramApiMediaItem {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  caption?: string;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30min — também ajuda a não estourar o limite de 200 req/h da Meta.
// Token de longa duração dura 60 dias a partir do refresh (docs Meta) — renova bem antes disso.
const REFRESH_THRESHOLD_MS = 45 * 24 * 60 * 60 * 1000;
const API_VERSION = 'v21.0';

/**
 * Feed "Comunidade" da home — Instagram Graph API (Instagram Business Login, sem precisar de
 * Página do Facebook). Credenciais ficam em StoreSettings.integrations (token/user id, coladas
 * pelo admin) + INSTAGRAM_APP_SECRET em env (infra, como ASAAS_API_URL). Nunca lança: sem
 * configuração ou com a Meta fora do ar, só loga e devolve `[]`/cache antigo — o feed é
 * decorativo, não pode derrubar a home.
 */
@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private cache: { items: InstagramMediaItem[]; fetchedAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  async getRecentMedia(limit = 6): Promise<InstagramMediaItem[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.items;
    }

    const settings = await this.settingsService.getInternal();
    const { instagramUserId } = settings.integrations;
    if (!instagramUserId) return [];

    try {
      const accessToken = await this.ensureFreshToken(settings.integrations);
      if (!accessToken) return this.cache?.items ?? [];

      const url = new URL(`https://graph.instagram.com/${API_VERSION}/${instagramUserId}/media`);
      url.searchParams.set('fields', 'id,caption,media_type,media_url,thumbnail_url,permalink');
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('access_token', accessToken);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Instagram respondeu ${response.status} ${response.statusText}`);
      }

      const body = (await response.json()) as { data?: InstagramApiMediaItem[] };
      const items: InstagramMediaItem[] = (body.data ?? [])
        .map((m) => ({
          id: m.id,
          imageUrl: (m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url) ?? '',
          permalink: m.permalink,
          caption: m.caption,
        }))
        // vídeo sem thumbnail_url não tem imagem nenhuma pra mostrar no grid.
        .filter((item) => item.imageUrl);

      this.cache = { items, fetchedAt: Date.now() };
      return items;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao buscar feed do Instagram: ${message}`);
      return this.cache?.items ?? [];
    }
  }

  private async ensureFreshToken(
    integrations: StoreSettings['integrations'],
  ): Promise<string | null> {
    const { instagramAccessToken, instagramTokenRefreshedAt } = integrations;
    if (!instagramAccessToken) return null;

    const refreshedAtMs = instagramTokenRefreshedAt
      ? new Date(instagramTokenRefreshedAt).getTime()
      : 0;
    if (refreshedAtMs && Date.now() - refreshedAtMs < REFRESH_THRESHOLD_MS) {
      return instagramAccessToken;
    }

    if (!refreshedAtMs) {
      // Token nunca passou por cá — pode ter sido colado como short-lived (~1h). Troca por
      // long-lived; exchange também funciona em cima de um token já long-lived, então é seguro
      // rodar sempre que não temos histórico de refresh.
      const appSecret = this.config.get<string>('INSTAGRAM_APP_SECRET');
      if (!appSecret) {
        this.logger.warn(
          'INSTAGRAM_APP_SECRET não configurada — usando o token colado como está (expira em ~1h se for short-lived).',
        );
        return instagramAccessToken;
      }
      return this.exchangeForLongLivedToken(instagramAccessToken, appSecret);
    }

    return this.refreshLongLivedToken(instagramAccessToken);
  }

  private async exchangeForLongLivedToken(
    shortLivedToken: string,
    appSecret: string,
  ): Promise<string> {
    const url = new URL('https://graph.instagram.com/access_token');
    url.searchParams.set('grant_type', 'ig_exchange_token');
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('access_token', shortLivedToken);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Falha ao trocar token do Instagram por long-lived (${response.status})`);
    }
    const body = (await response.json()) as { access_token: string };
    await this.settingsService.persistInstagramToken(body.access_token);
    return body.access_token;
  }

  private async refreshLongLivedToken(token: string): Promise<string> {
    const url = new URL('https://graph.instagram.com/refresh_access_token');
    url.searchParams.set('grant_type', 'ig_refresh_token');
    url.searchParams.set('access_token', token);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Falha ao renovar token do Instagram (${response.status})`);
    }
    const body = (await response.json()) as { access_token: string };
    await this.settingsService.persistInstagramToken(body.access_token);
    return body.access_token;
  }
}
