import mongoose from 'mongoose';

// Stores only a SHA-256 hash of each tested password, never the password
// itself, so the ranking/leaderboard feature can't leak real credentials.
const passwordTestSchema = new mongoose.Schema(
  {
    hash: { type: String, required: true, unique: true, index: true },
    length: { type: Number, required: true },
    entropyBits: { type: Number, required: true },
    strengthLabel: { type: String, required: true },
    isCommon: { type: Boolean, default: false },
    timesTested: { type: Number, default: 1 },
    lastTestedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model('PasswordTest', passwordTestSchema);
