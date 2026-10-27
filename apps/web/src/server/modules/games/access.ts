/** Replaced when the games module lands; denies until then. */
export async function canSubscribeRoom(_userId: string, _roomId: string) {
  return false;
}
export async function canSubscribeTournament(_userId: string, _tournamentId: string) {
  return false;
}
