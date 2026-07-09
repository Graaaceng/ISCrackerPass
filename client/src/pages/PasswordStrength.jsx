import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const SCENARIOS = [
  {
    key: 'online',
    label: 'Online login (throttled)',
    detail: 'A web login with rate-limiting, ~10 guesses/sec',
    guessesPerSecond: 10,
    facet: 'sky',
  },
  {
    key: 'online-fast',
    label: 'Online login (no throttling)',
    detail: 'A poorly-protected login, ~1,000 guesses/sec',
    guessesPerSecond: 1e3,
    facet: 'mint',
  },
  {
    key: 'offline-slow',
    label: 'Offline, slow hash (bcrypt)',
    detail: 'Stolen database, properly hashed, ~10,000 guesses/sec',
    guessesPerSecond: 1e4,
    facet: 'lavender',
  },
  {
    key: 'offline-fast',
    label: 'Offline, fast hash (MD5/SHA1)',
    detail: 'Stolen database, weakly hashed, ~10 billion guesses/sec (GPU)',
    guessesPerSecond: 1e10,
    facet: 'rose',
  },
];

function charsetSize(pw) {
  let size = 0;
  if (/[a-z]/.test(pw)) size += 26;
  if (/[A-Z]/.test(pw)) size += 26;
  if (/[0-9]/.test(pw)) size += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) size += 32; // rough estimate of common symbols
  return size;
}

// Small list of extremely common passwords / patterns, just to flag them —
// not an attempt to model a real cracking dictionary.
const COMMON_PASSWORDS = new Set([
  'password', '123456', '123456789', 'qwerty', 'letmein', 'abc123',
  'iloveyou', 'admin', 'welcome', 'monkey', 'football', 'password1',
  '111111', '123123', 'dragon', 'sunshine', 'princess', 'login',
]);

function formatDuration(seconds) {
  if (!isFinite(seconds)) return '—';
  if (seconds < 1) return 'instantly';

  const units = [
    ['century', 60 * 60 * 24 * 365 * 100],
    ['year', 60 * 60 * 24 * 365],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];

  for (const [name, unitSeconds] of units) {
    const value = seconds / unitSeconds;
    if (value >= 1) {
      const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
      if (name === 'century' && rounded > 1000) {
        return `${rounded.toExponential(1)} centuries`;
      }
      return `${rounded.toLocaleString()} ${name}${rounded === 1 ? '' : 's'}`;
    }
  }
  return 'instantly';
}

const SCRAMBLE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*?';

function randomScrambleChar() {
  return SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
}

function strengthLabel(entropyBits) {
  if (entropyBits < 28) return { text: 'Very weak', facet: 'rose' };
  if (entropyBits < 36) return { text: 'Weak', facet: 'sun' };
  if (entropyBits < 60) return { text: 'Reasonable', facet: 'sky' };
  if (entropyBits < 80) return { text: 'Strong', facet: 'mint' };
  return { text: 'Very strong', facet: 'lavender' };
}

const ANIMATION_MS = 2200;
const TICK_MS = 45;

export default function PasswordStrength() {
  const [password, setPassword] = useState('');
  const [cracking, setCracking] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [display, setDisplay] = useState([]);
  const [lockedCount, setLockedCount] = useState(0);

  const [ranking, setRanking] = useState([]);
  const [rankingError, setRankingError] = useState('');
  const [timesTested, setTimesTested] = useState(null);
  const [currentHash, setCurrentHash] = useState('');

  const timerRef = useRef(null);
  const scheduleRef = useRef([]);
  const startRef = useRef(0);

  async function refreshRanking() {
    try {
      const list = await api.get('/password-tests');
      setRanking(list);
      setRankingError('');
    } catch (err) {
      setRankingError(err.message);
    }
  }

  // Load the leaderboard once on mount so it's visible even before this
  // visitor has cracked anything themselves.
  useEffect(() => {
    refreshRanking();
  }, []);

  async function submitTestResult(pw, analysisSnapshot) {
    try {
      const hash = await sha256Hex(pw);
      const label = strengthLabel(analysisSnapshot.isCommon ? 0 : analysisSnapshot.entropyBits).text;
      const record = await api.post('/password-tests', {
        hash,
        length: analysisSnapshot.length,
        entropyBits: analysisSnapshot.entropyBits,
        strengthLabel: label,
        isCommon: analysisSnapshot.isCommon,
      });
      setCurrentHash(hash);
      setTimesTested(record.timesTested);
      refreshRanking();
    } catch (err) {
      setRankingError(err.message);
    }
  }

  // Any edit to the password cancels an in-progress or finished animation —
  // start fresh rather than showing a stale result.
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCracking(false);
    setShowResult(false);
    setLockedCount(0);
    setDisplay(password.split(''));
    setTimesTested(null);
    setCurrentHash('');
  }, [password]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  function startCracking() {
    if (!password || cracking) return;
    const chars = password.split('');
    const n = chars.length;
    const analysisSnapshot = analysis;

    // Give each character a random "lock-in" moment somewhere across the
    // animation window, sorted, so they resolve left-to-right-ish but not
    // perfectly evenly — reads more like a decryption effect.
    const schedule = chars
      .map((_, i) => i)
      .map((i) => ({ i, at: Math.random() * ANIMATION_MS * 0.85 + (i / n) * ANIMATION_MS * 0.15 }))
      .sort((a, b) => a.at - b.at);

    scheduleRef.current = schedule;
    startRef.current = performance.now();
    setLockedCount(0);
    setShowResult(false);
    setCracking(true);
    setDisplay(chars.map(() => randomScrambleChar()));

    timerRef.current = setInterval(() => {
      const elapsed = performance.now() - startRef.current;
      const lockedNow = schedule.filter((s) => s.at <= elapsed).length;

      setDisplay((prev) => {
        const next = [...prev];
        const lockedIndices = new Set(schedule.filter((s) => s.at <= elapsed).map((s) => s.i));
        for (let i = 0; i < n; i++) {
          next[i] = lockedIndices.has(i) ? chars[i] : randomScrambleChar();
        }
        return next;
      });
      setLockedCount(lockedNow);

      if (elapsed >= ANIMATION_MS) {
        clearInterval(timerRef.current);
        setDisplay(chars);
        setLockedCount(n);
        setCracking(false);
        setShowResult(true);
        submitTestResult(chars.join(''), analysisSnapshot);
      }
    }, TICK_MS);
  }

  const analysis = useMemo(() => {
    const pw = password;
    const length = pw.length;
    const pool = charsetSize(pw);
    const isCommon = COMMON_PASSWORDS.has(pw.toLowerCase());
    // Entropy in bits: length * log2(pool). Guard against log2(0).
    const entropyBits = pool > 0 ? length * Math.log2(pool) : 0;
    // Assume, on average, an attacker finds it halfway through the space.
    const keyspace = pool > 0 ? Math.pow(pool, length) : 0;
    const avgGuesses = keyspace / 2;

    const scenarios = SCENARIOS.map((s) => ({
      ...s,
      seconds: isCommon ? 0 : avgGuesses / s.guessesPerSecond,
    }));

    return { length, pool, entropyBits, isCommon, scenarios };
  }, [password]);

  const strength = strengthLabel(analysis.isCommon ? 0 : analysis.entropyBits);
  const maxSeconds = Math.max(...analysis.scenarios.map((s) => s.seconds), 1);

  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">visualizer</p>
        <h1 className="section-title">Password crack-time estimator</h1>
        <p>
          Type a password to see a rough estimate of how long it would take to guess it under a
          few different attack scenarios. This is a client-side estimate based on length and
          character variety — <strong>nothing you type is sent anywhere or stored</strong>.
        </p>

        <div
          className="card mono"
          style={{
            marginBottom: 'var(--space-4)',
            background: 'var(--isc-ink-strong)',
            padding: 'var(--space-5) var(--space-4)',
          }}
        >
          <div style={{ position: 'relative' }}>
            <input
              id="pw-input"
              className="mono"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Type a password…"
              autoComplete="off"
              spellCheck={false}
              disabled={cracking}
              aria-hidden={cracking}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--isc-mint)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xl)',
                letterSpacing: '0.12em',
                textAlign: 'center',
                padding: 0,
                visibility: cracking ? 'hidden' : 'visible',
              }}
            />

            {cracking && (
              <div
                aria-live="polite"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-xl)',
                  letterSpacing: '0.12em',
                  wordBreak: 'break-all',
                }}
              >
                {display.map((ch, i) => (
                  <span
                    key={i}
                    style={{ opacity: i < lockedCount ? 1 : 0.55 }}
                  >
                    {ch}
                  </span>
                ))}
              </div>
            )}
          </div>

          {cracking && (
            <div
              style={{
                marginTop: 'var(--space-3)',
                height: '4px',
                borderRadius: '999px',
                background: 'var(--isc-ink-strong)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(lockedCount / display.length) * 100}%`,
                  height: '100%',
                  background: 'var(--isc-mint)',
                  transition: 'width 45ms linear',
                }}
              />
            </div>
          )}
        </div>

        <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)', textAlign: 'center', }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={startCracking}
              disabled={!password || cracking}
            >
              {cracking ? 'Cracking…' : 'Crack this password'}
            </button>
        </div>

        {showResult && (
          <div style={{ marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`badge badge-${strength.facet}`}>{strength.text}</span>
            <span className="mono" style={{ color: 'var(--isc-muted)', fontSize: 'var(--text-sm)' }}>
              {analysis.length} characters · ~{analysis.entropyBits.toFixed(1)} bits of entropy
              {analysis.isCommon && ' · found in common password lists'}
            </span>
            {timesTested !== null && (
              <span className="badge badge-sun mono">
                tested {timesTested} time{timesTested === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}

        {showResult && (
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {analysis.scenarios.map((s) => {
              // Visual bar length on a log scale, capped for readability.
              const pct = Math.min(100, (Math.log10(s.seconds + 1) / Math.log10(maxSeconds + 1)) * 100);
              return (
                <div key={s.key} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    <div>
                      <strong>{s.label}</strong>
                      <div className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--isc-muted)' }}>
                        {s.detail}
                      </div>
                    </div>
                    <span className={`badge badge-${s.facet} mono`} style={{ fontSize: 'var(--text-sm)' }}>
                      {formatDuration(s.seconds)}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 'var(--space-2)',
                      height: '8px',
                      borderRadius: '999px',
                      background: 'var(--isc-paper-dim)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: `var(--isc-${s.facet})`,
                        transition: 'width 150ms ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="card" style={{ marginTop: 'var(--space-5)' }}>
          <h3>Leaderboard</h3>
          <p style={{ color: 'var(--isc-muted)', fontSize: 'var(--text-sm)' }}>
            Every password ever cracked here, ranked by strength. Only a one-way hash of each
            password is stored — never the password itself — so this list can show repeats
            without knowing what anyone actually typed.
          </p>

          {rankingError && <p className="notice error">Couldn't load the leaderboard: {rankingError}</p>}

          {!rankingError && ranking.length === 0 && (
            <p style={{ color: 'var(--isc-muted)' }}>No passwords cracked yet — be the first.</p>
          )}

          {ranking.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="mono" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['#', 'Length', 'Entropy', 'Strength', 'Times tested'].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          padding: 'var(--space-2)',
                          borderBottom: '1px solid var(--isc-line)',
                          color: 'var(--isc-muted)',
                          fontWeight: 500,
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr
                      key={r._id}
                      style={{
                        background: r.hash === currentHash ? 'var(--isc-paper-dim)' : undefined,
                        borderBottom: '1px solid var(--isc-line)',
                      }}
                    >
                      <td style={{ padding: 'var(--space-2)' }}>{i + 1}</td>
                      <td style={{ padding: 'var(--space-2)' }}>{r.length}</td>
                      <td style={{ padding: 'var(--space-2)' }}>{r.entropyBits.toFixed(1)} bits</td>
                      <td style={{ padding: 'var(--space-2)' }}>{r.strengthLabel}</td>
                      <td style={{ padding: 'var(--space-2)' }}>{r.timesTested}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ marginTop: 'var(--space-5)' }}>
          <h3>How this works</h3>
          <p style={{ marginBottom: 0 }}>
            The estimate multiplies the size of the character pool you used (lowercase, uppercase,
            digits, symbols) by the length of the password to get a total "keyspace", then assumes
            an attacker on average has to try half of it. That number of guesses is divided by an
            illustrative guess-rate for each scenario. Real attackers also use dictionaries and
            known-pattern lists, which is why the tool flags passwords that appear on common
            password lists as crackable instantly, regardless of length.
          </p>
        </div>
      </div>
    </section>
  );
}
