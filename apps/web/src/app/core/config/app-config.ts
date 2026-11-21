import { HttpBackend, HttpClient } from '@angular/common/http';
import { EnvironmentProviders, Injectable, inject, provideAppInitializer } from '@angular/core';
import { RuntimeConfig } from '@provisioning/contracts';
import { firstValueFrom } from 'rxjs';
import * as z from 'zod';

export const CONFIG_URL = '/config.json';

/**
 * Runtime configuration from /config.json (written by CDK on deploy, by public/config.json locally).
 * Loaded once before bootstrap; read it anywhere with `inject(AppConfig).value`.
 */
@Injectable({ providedIn: 'root' })
export class AppConfig {
  // HttpBackend skips the interceptors: they depend on this config.
  private readonly http = new HttpClient(inject(HttpBackend));
  private config: RuntimeConfig | null = null;

  get value(): RuntimeConfig {
    if (!this.config) {
      throw new Error('Runtime config is not loaded yet.');
    }
    return this.config;
  }

  async load(): Promise<RuntimeConfig> {
    const body = await firstValueFrom(this.http.get<unknown>(CONFIG_URL));
    const result = RuntimeConfig.safeParse(body);
    if (!result.success) {
      throw new Error(`Invalid ${CONFIG_URL}:\n${z.prettifyError(result.error)}`);
    }
    this.config = result.data;
    return result.data;
  }
}

export function provideRuntimeConfig(): EnvironmentProviders {
  return provideAppInitializer(() => inject(AppConfig).load());
}
