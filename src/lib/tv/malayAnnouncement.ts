export interface MalayAnnouncementInput {
  callBy: 'name' | 'number';
  display: string;
  roomLabel: string;
}

export function buildMalayAnnouncement({ callBy, display, roomLabel }: MalayAnnouncementInput): string {
  return callBy === 'name'
    ? `Panggilan untuk ${display}, sila ke ${roomLabel} sekarang.`
    : `Nombor giliran ${display}, sila ke ${roomLabel} sekarang.`;
}
