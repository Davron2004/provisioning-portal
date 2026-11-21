import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LOCAL_CONFIG } from '../../../testing/test-config';
import { AppConfig, CONFIG_URL } from './app-config';

describe('AppConfig', () => {
  let http: HttpTestingController;
  const interceptor = vi.fn((req, next) => next(req));

  beforeEach(() => {
    interceptor.mockClear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([interceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and validates /config.json', async () => {
    const config = TestBed.inject(AppConfig);
    const loaded = config.load();
    http.expectOne(CONFIG_URL).flush(LOCAL_CONFIG);

    await expect(loaded).resolves.toEqual(LOCAL_CONFIG);
    expect(config.value).toEqual(LOCAL_CONFIG);
  });

  it('bypasses HTTP interceptors, which depend on the config', async () => {
    const loaded = TestBed.inject(AppConfig).load();
    http.expectOne(CONFIG_URL).flush(LOCAL_CONFIG);
    await loaded;

    expect(interceptor).not.toHaveBeenCalled();
    // Sanity check: the interceptor is active for ordinary requests.
    TestBed.inject(HttpClient).get('/other').subscribe();
    http.expectOne('/other').flush({});
    expect(interceptor).toHaveBeenCalledOnce();
  });

  it('rejects a config that does not match the contract, naming the field', async () => {
    const loaded = TestBed.inject(AppConfig).load();
    http.expectOne(CONFIG_URL).flush({ ...LOCAL_CONFIG, apiBaseUrl: 'not a url' });

    await expect(loaded).rejects.toThrow(/apiBaseUrl/);
  });

  it('throws a clear error when read before loading', () => {
    expect(() => TestBed.inject(AppConfig).value).toThrow('Runtime config is not loaded yet.');
  });
});
