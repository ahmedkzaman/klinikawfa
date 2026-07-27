export interface MalayAnnouncementInput {
  callBy: 'name' | 'number';
  display: string;
  roomLabel: string;
}

function formatNameForSpeech(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const letters = trimmed.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return trimmed;

  const lowercaseParticles = new Set(['bin', 'binti', 'a/l', 'a/p']);
  return trimmed
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (index > 0 && lowercaseParticles.has(word)) return word;
      return word.replace(/(^|[-'])\p{L}/gu, (letter) => letter.toUpperCase());
    })
    .join(' ');
}

export function buildMalayAnnouncement({ callBy, display, roomLabel }: MalayAnnouncementInput): string {
  return callBy === 'name'
    ? `Panggilan untuk ${formatNameForSpeech(display)}, sila ke ${roomLabel} sekarang.`
    : `Nombor giliran ${display}, sila ke ${roomLabel} sekarang.`;
}
