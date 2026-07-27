export interface MalayAnnouncementInput {
  callBy: 'name' | 'number';
  display: string;
  roomLabel: string;
}

function formatNameForSpeech(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ms-MY');
}

export function buildMalayAnnouncement({ callBy, display, roomLabel }: MalayAnnouncementInput): string {
  return callBy === 'name'
    ? `Panggilan untuk ${formatNameForSpeech(display)}, sila ke ${roomLabel} sekarang.`
    : `Nombor giliran ${display}, sila ke ${roomLabel} sekarang.`;
}
