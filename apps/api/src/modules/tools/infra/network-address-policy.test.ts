import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './network-address-policy';

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '142.250.79.14', '2001:4860:4860::8888'])(
    'aceita o endereço público %s',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it.each([
    ['loopback IPv4', '127.0.0.1'],
    ['loopback IPv6', '::1'],
    ['loopback IPv4 escrito em IPv6', '::ffff:127.0.0.1'],
    ['rede privada 10/8', '10.0.0.5'],
    ['rede privada 172.16/12', '172.20.1.1'],
    ['rede privada 192.168/16', '192.168.0.10'],
    ['metadados do Google Cloud', '169.254.169.254'],
    ['metadados em IPv6 mapeado', '::ffff:169.254.169.254'],
    ['CGNAT', '100.64.0.1'],
    ['IPv6 local único', 'fd00::1'],
    ['IPv6 link-local', 'fe80::1'],
    ['não especificado', '0.0.0.0'],
    ['multicast', '224.0.0.1'],
    ['texto inválido', 'metadata.google.internal'],
  ])('recusa %s (%s)', (_description, address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});
