import { expect, it } from 'vitest';
import { parseBulkText } from './bulkShowParser';

it.each([['server2', 'server3'], ['s2', 's3']])('imports both server URLs using %s / %s', (s2, s3) => {
  const result = parseBulkText(`Pajama Drive\n2026-11-05\n19:00 WIB\n${s2}: https://sforge.my.id/master.m3u8\n${s3}: https://sforge.my.id/master-final.m3u8`);
  expect(result.shows).toHaveLength(1);
  expect(result.shows[0].server2_url).toBe('https://sforge.my.id/master.m3u8');
  expect(result.shows[0].server3_url).toBe('https://sforge.my.id/master-final.m3u8');
});