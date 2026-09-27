import { Role } from '../../../core/models';

/** Sign-in name suggested from an email: "Riya.Kapoor@crm.com" -> "riya.kapoor". */
export function suggestUsername(email: string): string {
  const local = (email ?? '').split('@')[0] ?? '';
  return local.toLowerCase().replace(/[^\w.+-]/g, '').slice(0, 150);
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz'; // no l
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O
const DIGITS = '23456789'; // no 0, 1
const SYMBOLS = '#@$%&*!?';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** A random temporary password: 14 characters, at least one of each kind, no look-alike characters. */
export function generatePassword(random: (max: number) => number = secureRandom): string {
  const pick = (set: string) => set[random(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < 14) {
    chars.push(pick(ALL));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function secureRandom(max: number): number {
  const buffer = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / max) * max; // avoid modulo bias
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

/** What each role can do, shown under the role dropdown. */
export const ROLE_HINTS: Record<Role, string> = {
  [Role.Admin]: 'Full access to everything, including accounts, finance and settings.',
  [Role.SalesManager]: 'Sees all leads, assigns them to executives and reviews sales.',
  [Role.SalesExec]: 'Works only the leads assigned to them.',
  [Role.ProjectManager]: 'Runs projects and expenses. Never sees leads, payments or project totals.',
};
