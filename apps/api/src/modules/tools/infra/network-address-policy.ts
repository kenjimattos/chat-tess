import ipaddr from 'ipaddr.js';

/**
 * Só endereços públicos de internet podem ser acessados pelas tools. Bloqueia
 * loopback, redes privadas, link-local (inclui o servidor de metadados do
 * Google Cloud, 169.254.169.254), CGNAT, multicast e reservados, em IPv4 e IPv6.
 */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return false;
  }
  const parsed = ipaddr.parse(address);
  // "::ffff:127.0.0.1" é o loopback IPv4 escrito em IPv6: classifica pelo IPv4.
  const normalized =
    parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()
      ? (parsed as ipaddr.IPv6).toIPv4Address()
      : parsed;
  return normalized.range() === 'unicast';
}
