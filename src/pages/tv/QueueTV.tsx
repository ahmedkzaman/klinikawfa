import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Tv as TvIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';

interface CallEvent {
  id: string;
  display: string; // queue number (formatted) or patient name
  roomLabel: string;
  ts: number;
}

/**
 * Waiting-room TV. Listens for queue_entries updates and announces the
 * patient via Web Speech API + chime when their status flips to with_doctor.
 *
 * Mounted at /tv outside any layout. Dark, full-screen, 16:9-friendly.
 */
export default function QueueTV() {
  const [started, setStarted] = useState(false);
  const { settings } = useClinicSettings();
  const [current, setCurrent] = useState<CallEvent | null>(null);
  const [recent, setRecent] = useState<CallEvent[]>([]);
  const queueRef = useRef<CallEvent[]>([]);
  const playingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  // Realtime subscription
  useEffect(() => {
    if (!started) return;

    const channel = supabase
      .channel('tv-queue')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'queue_entries' },
        async (payload) => {
          const next = payload.new as Record<string, unknown>;
          const prev = (payload.old ?? {}) as Record<string, unknown>;

          const becameWithDoctor =
            next.clinic_status === 'with_doctor' &&
            prev.clinic_status !== 'with_doctor';
          const calledTsChanged =
            next.called_at && next.called_at !== prev.called_at;

          if (!(becameWithDoctor || (next.clinic_status === 'with_doctor' && calledTsChanged))) {
            return;
          }

          const id = next.id as string;
          const eventKey = `${id}:${next.called_at}`;
          if (seenRef.current.has(eventKey)) return;
          seenRef.current.add(eventKey);

          // Fetch joined info
          const { data, error } = await supabase
            .from('queue_entries')
            .select(
              'id, queue_number, patients:patient_id(name), rooms:assigned_room_id(label)',
            )
            .eq('id', id)
            .maybeSingle();
          if (error || !data) return;

          const callBy = settings.queue_call_by ?? 'number';
          const patient = (data.patients as { name?: string } | null)?.name ?? 'Patient';
          const room = (data.rooms as { label?: string } | null)?.label ?? 'consultation room';
          const display =
            callBy === 'name'
              ? patient
              : `Number ${data.queue_number ?? ''}`.trim();

          const evt: CallEvent = {
            id: `${id}-${next.called_at}`,
            display,
            roomLabel: room,
            ts: Date.now(),
          };
          queueRef.current.push(evt);
          processQueue();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, settings.queue_call_by]);

  const processQueue = async () => {
    if (playingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    playingRef.current = true;
    setCurrent(next);
    setRecent((r) => [next, ...r].slice(0, 5));

    // Chime
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        await audioRef.current.play().catch(() => {});
      }
    } catch {
      /* noop */
    }
    await wait(800);

    // Speak
    try {
      const utter = new SpeechSynthesisUtterance(
        `Calling ${next.display}, to ${next.roomLabel}`,
      );
      utter.rate = 0.95;
      utter.volume = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
      // Repeat once for clarity
      await wait(2200);
      window.speechSynthesis.speak(
        new SpeechSynthesisUtterance(`Calling ${next.display}, to ${next.roomLabel}`),
      );
    } catch {
      /* noop */
    }

    await wait(4000);
    playingRef.current = false;
    if (queueRef.current.length > 0) processQueue();
  };

  if (!started) {
    return (
      <div className="fixed inset-0 bg-slate-950 text-white flex flex-col items-center justify-center gap-6 p-8">
        <TvIcon className="h-20 w-20 text-blue-400" />
        <h1 className="text-4xl font-bold">Waiting Room TV</h1>
        <p className="max-w-lg text-center text-slate-400">
          Start the display to enable patient call announcements. Audio playback
          requires a one-time tap.
        </p>
        <button
          onClick={() => {
            // Pre-warm speechSynthesis (gesture unlock)
            try {
              window.speechSynthesis.speak(new SpeechSynthesisUtterance(' '));
            } catch {
              /* noop */
            }
            setStarted(true);
          }}
          className="rounded-2xl bg-blue-600 hover:bg-blue-500 px-12 py-6 text-2xl font-semibold shadow-2xl transition-all hover:scale-105"
        >
          ▶ Start TV Display
        </button>
        <audio ref={audioRef} src="/sounds/chime.mp3" preload="auto" />
      </div>
    );
  }

  const ytId = settings.tv_youtube_id?.trim();
  const ticker = settings.tv_ticker_text?.trim();

  return (
    <div className="fixed inset-0 bg-slate-950 text-white flex overflow-hidden">
      <audio ref={audioRef} src="/sounds/chime.mp3" preload="auto" />

      {/* Left 65%: Video + ticker */}
      <div className="flex-[65] flex flex-col">
        <div className="flex-1 bg-black flex items-center justify-center">
          {ytId ? (
            <iframe
              key={ytId}
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&controls=0&modestbranding=1&rel=0`}
              title="Clinic TV"
              allow="autoplay; encrypted-media"
              className="w-full h-full"
            />
          ) : (
            <div className="text-slate-500 text-center px-8">
              <TvIcon className="h-16 w-16 mx-auto mb-4 opacity-40" />
              <p>Set a YouTube Video ID under Settings → Queue &amp; TV.</p>
            </div>
          )}
        </div>

        {/* Ticker */}
        <div className="h-14 bg-blue-900/80 border-t border-blue-700 flex items-center overflow-hidden">
          <div className="whitespace-nowrap animate-tv-marquee text-2xl font-medium px-6">
            {ticker || 'Welcome to Klinik Awfa. Please wait to be called.'}
          </div>
        </div>
      </div>

      {/* Right 35%: Now Calling */}
      <div className="flex-[35] flex flex-col bg-gradient-to-b from-slate-900 to-slate-950 border-l border-slate-800">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-blue-400" />
          <span className="text-sm uppercase tracking-widest text-slate-400">
            Now Calling
          </span>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div
                key={current.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                className="text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 1.2, repeat: 3 }}
                  className="text-7xl font-black tracking-tight text-white drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]"
                >
                  {current.display}
                </motion.div>
                <div className="mt-6 text-2xl text-blue-300">
                  Please proceed to
                </div>
                <div className="mt-2 text-5xl font-bold text-blue-400">
                  {current.roomLabel}
                </div>
              </motion.div>
            ) : (
              <div className="text-center text-slate-500">
                <p className="text-xl">Waiting for next patient…</p>
              </div>
            )}
          </AnimatePresence>
        </div>

        {recent.length > 1 && (
          <div className="border-t border-slate-800 px-6 py-3">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">
              Recent
            </div>
            <ul className="space-y-1 text-sm">
              {recent.slice(1, 5).map((r) => (
                <li key={r.id} className="flex justify-between text-slate-400">
                  <span>{r.display}</span>
                  <span className="text-slate-600">→ {r.roomLabel}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <style>{`
        @keyframes tv-marquee {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
        .animate-tv-marquee {
          animation: tv-marquee 28s linear infinite;
        }
      `}</style>
    </div>
  );
}

function wait(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
