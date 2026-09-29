import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api-client';

describe('authenticated report downloads', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('fetches the report with bearer auth and downloads the response blob', async () => {
    sessionStorage.setItem('noovastack.token', 'report-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('report', {
      status: 200,
      headers: { 'Content-Disposition': 'attachment; filename="assessment.pdf"' },
    }));
    const createObjectURL = vi.fn(() => 'blob:report');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await api.downloadScanReport('scan-123', 'pdf');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/reports/scan/scan-123/export?format=pdf');
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer report-token');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
  });
});
