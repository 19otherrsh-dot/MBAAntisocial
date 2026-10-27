/** Replaced when the hub module lands; denies until then. */
export async function canSubscribeServer(_userId: string, _serverId: string) {
  return false;
}
export async function canSubscribeChannel(_userId: string, _channelId: string) {
  return false;
}
export async function canSubscribeConversation(_userId: string, _conversationId: string) {
  return false;
}
