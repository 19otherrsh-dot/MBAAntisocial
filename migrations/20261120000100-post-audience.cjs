/**
 * Feed posts gained an explicit audience. Posts written before it was added
 * were campus-only in intent, so they are marked that way.
 */
module.exports = {
  async up(db) {
    await db.collection('posts').updateMany({ audience: { $exists: false } }, { $set: { audience: 'campus' } });
  },
  async down(db) {
    await db.collection('posts').updateMany({ audience: 'campus' }, { $unset: { audience: '' } });
  },
};
