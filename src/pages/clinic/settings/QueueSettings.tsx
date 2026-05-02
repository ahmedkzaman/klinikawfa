import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Tv, Hash, User as UserIcon, Pencil, Check, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAllRooms,
  useCreateRoom,
  useUpdateRoom,
} from '@/hooks/clinic/useRooms';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { bento, pageInner, pageShell, primaryBtn } from '@/lib/clinic/bentoTokens';

export default function QueueSettings() {
  const { data: rooms = [] } = useAllRooms();
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();
  const { settings, isLoading, update } = useClinicSettings();

  const [newRoomLabel, setNewRoomLabel] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [youtubeId, setYoutubeId] = useState('');
  const [tickerText, setTickerText] = useState('');
  const [callBy, setCallBy] = useState<'name' | 'number'>('number');
  const [hydrated, setHydrated] = useState(false);

  if (!hydrated && !isLoading && settings.id) {
    setYoutubeId(settings.tv_youtube_id ?? '');
    setTickerText(settings.tv_ticker_text ?? '');
    setCallBy((settings.queue_call_by as 'name' | 'number') ?? 'number');
    setHydrated(true);
  }

  const addRoom = async () => {
    try {
      await createRoom.mutateAsync(newRoomLabel);
      setNewRoomLabel('');
      toast.success('Room added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add room');
    }
  };

  const toggleRoom = async (id: string, status: string) => {
    try {
      await updateRoom.mutateAsync({
        id,
        status: status === 'active' ? 'inactive' : 'active',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const startEditRoom = (id: string, label: string) => {
    setEditingRoomId(id);
    setEditingLabel(label);
  };

  const cancelEditRoom = () => {
    setEditingRoomId(null);
    setEditingLabel('');
  };

  const saveEditRoom = async (id: string) => {
    const label = editingLabel.trim();
    if (!label) return;
    try {
      await updateRoom.mutateAsync({ id, label });
      toast.success('Room renamed');
      cancelEditRoom();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename');
    }
  };

  const extractYouTubeId = (input: string) => {
    if (!input) return '';
    const trimmed = input.trim();
    if (trimmed.length === 11 && !trimmed.includes('youtube.com') && !trimmed.includes('youtu.be')) {
      return trimmed;
    }
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]{11})/);
    return match ? match[1] : trimmed;
  };

  const saveTv = async () => {
    try {
      const extractedId = extractYouTubeId(youtubeId);
      if (extractedId !== youtubeId) setYoutubeId(extractedId);
      await update.mutateAsync({
        tv_youtube_id: extractedId || null,
        tv_ticker_text: tickerText.trim() || null,
        queue_call_by: callBy,
      });
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Queue &amp; TV
          </h1>
          <p className="text-sm text-slate-500">
            Manage clinic rooms and the waiting-room TV display.
          </p>
        </div>

        {/* Rooms */}
        <Card className={`${bento} p-6 space-y-4`}>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Clinic Rooms</h2>
            <p className="text-sm text-slate-500">
              Doctors will pick from active rooms when calling a patient.
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="e.g. Treatment Room"
              value={newRoomLabel}
              onChange={(e) => setNewRoomLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addRoom();
              }}
            />
            <Button
              onClick={addRoom}
              disabled={createRoom.isPending || !newRoomLabel.trim()}
              className={primaryBtn}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {rooms.length === 0 && (
              <div className="px-4 py-6 text-sm text-slate-500 text-center">
                No rooms yet.
              </div>
            )}
            {rooms.map((room) => {
              const active = (room.status ?? 'active') === 'active';
              const isEditing = editingRoomId === room.id;
              return (
                <div
                  key={room.id}
                  className="flex items-center justify-between px-4 py-3 gap-3"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        active ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                    {isEditing ? (
                      <Input
                        autoFocus
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editingLabel.trim()) saveEditRoom(room.id);
                          if (e.key === 'Escape') cancelEditRoom();
                        }}
                        className="h-8 text-sm"
                      />
                    ) : (
                      <>
                        <span className="text-sm font-medium text-slate-800 truncate">
                          {room.label}
                        </span>
                        {!active && (
                          <span className="text-xs text-slate-400">(inactive)</span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isEditing ? (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-emerald-600"
                          onClick={() => saveEditRoom(room.id)}
                          disabled={editingLabel.trim().length === 0 || updateRoom.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-slate-500"
                          onClick={cancelEditRoom}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-slate-500"
                          onClick={() => startEditRoom(room.id, room.label)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Switch
                          checked={active}
                          onCheckedChange={() => toggleRoom(room.id, room.status ?? 'active')}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* TV */}
        <Card className={`${bento} p-6 space-y-4`}>
          <div className="flex items-center gap-2">
            <Tv className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">Waiting Room TV</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="yt">YouTube Video Link</Label>
              <Input
                id="yt"
                placeholder="https://youtu.be/dQw4w9WgXcQ"
                value={youtubeId}
                onChange={(e) => setYoutubeId(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">
                Paste the full YouTube URL (e.g., https://youtu.be/...). The system will automatically extract the video ID.
              </p>
            </div>

            <div>
              <Label className="mb-2 block">Call patients by</Label>
              <RadioGroup
                value={callBy}
                onValueChange={(v) => setCallBy(v as 'name' | 'number')}
                className="flex gap-3"
              >
                <Label
                  htmlFor="cb-num"
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
                >
                  <RadioGroupItem id="cb-num" value="number" />
                  <Hash className="h-4 w-4" />
                  Queue Number
                </Label>
                <Label
                  htmlFor="cb-name"
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
                >
                  <RadioGroupItem id="cb-name" value="name" />
                  <UserIcon className="h-4 w-4" />
                  Patient Name
                </Label>
              </RadioGroup>
            </div>
          </div>

          <div>
            <Label htmlFor="ticker">Scrolling Ticker Text</Label>
            <Textarea
              id="ticker"
              rows={2}
              placeholder="Welcome to Klinik Awfa. Please wait to be called."
              value={tickerText}
              onChange={(e) => setTickerText(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={saveTv} disabled={update.isPending} className={primaryBtn}>
              Save TV Settings
            </Button>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm text-slate-600">
            Open the TV display at{' '}
            <a
              href="/tv"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline"
            >
              /tv
            </a>{' '}
            on the waiting-room screen.
          </div>

          <div className="space-y-2">
            <Label>Live Preview</Label>
            <iframe
              src="/tv?preview=true"
              title="TV Preview"
              className="w-full aspect-video rounded-xl border-4 border-slate-800 pointer-events-none"
            />
            <p className="text-xs text-slate-500">
              Silent preview — audio and announcements are suppressed.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
