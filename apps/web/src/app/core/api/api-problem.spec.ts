import { HttpErrorResponse } from '@angular/common/http';
import { Account } from '@provisioning/contracts';
import { toApiProblem } from './api-problem';

const httpError = (status: number, error: unknown = null) =>
  new HttpErrorResponse({ status, error, url: 'http://api.test/accounts' });

describe('toApiProblem', () => {
  it('uses the ApiError body when the API sends one', () => {
    const problem = toApiProblem(
      httpError(409, {
        error: { code: 'conflict', message: 'Extension 2101 is taken.', details: { line: 0 } },
      }),
    );
    expect(problem).toEqual({
      status: 409,
      code: 'conflict',
      message: 'Extension 2101 is taken.',
      details: { line: 0 },
    });
  });

  it('reports network failures', () => {
    expect(toApiProblem(httpError(0))).toMatchObject({ status: 0, code: 'network' });
  });

  it('falls back to a message by status for non-API bodies', () => {
    expect(toApiProblem(httpError(502, '<html>Bad gateway</html>'))).toMatchObject({
      status: 502,
      code: 'internal',
      message: 'The server ran into a problem. Try again in a moment.',
    });
    expect(toApiProblem(httpError(404)).message).toBe(
      'We could not find what you were looking for.',
    );
  });

  it('reports responses that do not match the contract', () => {
    const parsed = Account.safeParse({ id: 'acc_1' });
    expect(parsed.success).toBe(false);
    expect(toApiProblem(parsed.error)).toMatchObject({ code: 'invalid_response' });
  });

  it('handles anything else', () => {
    expect(toApiProblem(new Error('boom'))).toMatchObject({ code: 'unknown' });
  });
});
