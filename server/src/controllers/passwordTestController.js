import PasswordTest from '../models/PasswordTest.js';

const HEX64 = /^[a-f0-9]{64}$/i;

// Record (or bump the counter on) a tested password, identified only by
// its SHA-256 hash. Upserts: first time -> create with timesTested 1,
// every repeat -> increment timesTested and refresh lastTestedAt.
export async function recordTest(req, res, next) {
  try {
    const { hash, length, entropyBits, strengthLabel, isCommon } = req.body;

    if (typeof hash !== 'string' || !HEX64.test(hash)) {
      return res.status(400).json({ error: 'hash must be a SHA-256 hex digest' });
    }
    if (typeof length !== 'number' || typeof entropyBits !== 'number' || typeof strengthLabel !== 'string') {
      return res.status(400).json({ error: 'length, entropyBits, strengthLabel are required' });
    }

    const record = await PasswordTest.findOneAndUpdate(
      { hash },
      {
        $inc: { timesTested: 1 },
        $set: { length, entropyBits, strengthLabel, isCommon: !!isCommon, lastTestedAt: new Date() },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
}

// Ranking, strongest first. Kept small since this is a demo leaderboard.
export async function listRanking(req, res, next) {
  try {
    const records = await PasswordTest.find().sort({ entropyBits: -1 }).limit(50);
    res.json(records);
  } catch (err) {
    next(err);
  }
}

export async function getByHash(req, res, next) {
  try {
    const record = await PasswordTest.findOne({ hash: req.params.hash });
    if (!record) return res.status(404).json({ error: 'Not found' });
    res.json(record);
  } catch (err) {
    next(err);
  }
}
