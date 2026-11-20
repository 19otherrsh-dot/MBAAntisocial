/**
 * Course reviews are grouped and de-duplicated on a normalised target name
 * (`targetKey`). Reviews written before that field existed are given one, using
 * the same rule as `targetKeyOf` in src/models/Whisper.ts.
 */
function targetKeyOf(name) {
  return String(name)
    .toLowerCase()
    .replace(/\b(prof|professor|dr|doctor|mr|mrs|ms|sir|madam|maam)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

module.exports = {
  async up(db) {
    const whispers = db.collection('whispers');
    const cursor = whispers.find({ targetKey: { $exists: false } }, { projection: { targetName: 1 } });
    const ops = [];
    for await (const doc of cursor) {
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { targetKey: targetKeyOf(doc.targetName) } } } });
      if (ops.length === 500) await whispers.bulkWrite(ops.splice(0));
    }
    if (ops.length) await whispers.bulkWrite(ops);
  },

  async down() {
    // The key is derived and harmless to keep; nothing to undo.
  },
};
