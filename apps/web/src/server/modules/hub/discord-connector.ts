import type { IntegrationConnector } from '../integrations/registry';

/** Replaced by the Discord bridge in the hub module. */
export function discordConnector(): IntegrationConnector | null {
  return null;
}
