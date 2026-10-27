import { Types } from 'mongoose';
import GameRoom from '@/models/games/GameRoom';
import Tournament from '@/models/games/Tournament';
import User from '@/models/User';

/** Seated players and spectators hear a room's events. */
export async function canSubscribeRoom(userId: string, roomId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(roomId)) return false;
  return Boolean(await GameRoom.exists({ _id: roomId, $or: [{ 'seats.user': userId }, { spectators: userId }] }));
}

/** Anyone on the tournament's campus can follow its bracket. */
export async function canSubscribeTournament(userId: string, tournamentId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(tournamentId)) return false;
  const [user, tournament] = await Promise.all([
    User.findById(userId).select('campus').lean(),
    Tournament.findById(tournamentId).select('campus').lean(),
  ]);
  return Boolean(user && tournament && user.campus === tournament.campus);
}
