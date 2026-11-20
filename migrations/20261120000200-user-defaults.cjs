/**
 * Accounts created before the game layer, single sign-on, and email
 * notifications get the defaults new accounts are created with.
 */
module.exports = {
  async up(db) {
    const users = db.collection('users');
    await users.updateMany({ dailyGoal: { $exists: false } }, { $set: { dailyGoal: 40 } });
    await users.updateMany({ streakShields: { $exists: false } }, { $set: { streakShields: 0 } });
    await users.updateMany({ linkedAccounts: { $exists: false } }, { $set: { linkedAccounts: [] } });
    await users.updateMany({ 'notificationPrefs.email': { $exists: false } }, { $set: { 'notificationPrefs.email': true } });
  },
  async down() {
    // Defaults only; removing them would change nothing the app relies on.
  },
};
