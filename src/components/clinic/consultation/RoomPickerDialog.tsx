import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useRooms } from '@/hooks/clinic/useRooms';

const LAST_ROOM_KEY = 'klinikawfa.lastRoomId';

interface RoomPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (roomId: string) => void;
  patientLabel?: string;
  pending?: boolean;
}

/**
 * Asks the doctor which room they're calling the patient into.
 * Persists the last choice to localStorage so they aren't asked twice in a row.
 */
export function RoomPickerDialog({
  open,
  onOpenChange,
  onConfirm,
  patientLabel,
  pending,
}: RoomPickerDialogProps) {
  const { data: rooms = [], isLoading } = useRooms();
  const [roomId, setRoomId] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const stored = localStorage.getItem(LAST_ROOM_KEY) ?? '';
    if (stored && rooms.some((r) => r.id === stored)) {
      setRoomId(stored);
    } else if (rooms[0]) {
      setRoomId(rooms[0].id);
    }
  }, [open, rooms]);

  const handleConfirm = () => {
    if (!roomId) return;
    localStorage.setItem(LAST_ROOM_KEY, roomId);
    onConfirm(roomId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Call patient to room</DialogTitle>
          <DialogDescription>
            {patientLabel
              ? `Calling ${patientLabel}. Select the consultation room.`
              : 'Select the consultation room.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading rooms…</p>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No active rooms. Add one under Settings → Queue &amp; TV.
          </p>
        ) : (
          <RadioGroup value={roomId} onValueChange={setRoomId} className="grid gap-2 py-2">
            {rooms.map((room) => (
              <Label
                key={room.id}
                htmlFor={`room-${room.id}`}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
              >
                <RadioGroupItem id={`room-${room.id}`} value={room.id} />
                <span className="text-sm font-medium">{room.label}</span>
              </Label>
            ))}
          </RadioGroup>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!roomId || pending || rooms.length === 0}
            className="gap-1"
          >
            <Phone className="h-3.5 w-3.5" />
            {pending ? 'Calling…' : 'Call patient'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
