import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Tv as TvIcon } from 'lucide-react';
import ReactPlayer from 'react-player';
import { supabase } from '@/integrations/supabase/client';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { Slider } from '@/components/ui/slider';

interface CallEvent {
  id: string;
  display: string; // queue number (bare, e.g. "12") or patient name
  roomLabel: string;
  ts: number;
}

/**
 * Waiting-room TV. Listens for queue_entries updates and announces the
 * patient via Web Speech API + ding-dong chime when their status flips to
 * with_doctor. Shows the last 3 calls as a vertical stack (newest at the
 * bottom, glowing & flashing).
 *
 * Mounted at /tv outside any layout. Dark, full-screen, 16:9-friendly.
 *
 * Preview mode (?preview=true): bypasses the gate screen, suppresses ALL
 * audio (chime, TTS), and forces the video player muted. Used by the
 * settings page Live Preview iframe.
 */
const isPreview =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('preview') === 'true';

// Professional chime hosted in Lovable Cloud public storage.
// Capped to CHIME_MAX_MS so the TTS announcement doesn't wait too long.
const CHIME_URL =
  'https://ncysmppzfjtiekfnomdv.supabase.co/storage/v1/object/public/assets/clinic-chime.mp3';
const CHIME_MAX_MS = 3000;

export default function QueueTV() {
  const [started, setStarted] = useState(isPreview);
  const { settings } = useClinicSettings();
  const [recentCalls, setRecentCalls] = useState<CallEvent[]>([]);
  const [videoVolume, setVideoVolume] = useState(0.5);
  const queueRef = useRef<CallEvent[]>([]);
  const playingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentTtsAudioRef = useRef<HTMLAudioElement | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  // Realtime subscription
  useEffect(() => {
    if (!started || isPreview) return;

    const channel = supabase
      .channel('tv-queue')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'queue_entries' },
        async (payload) => {
          const next = payload.new as Record<string, unknown>;
          const prev = (payload.old ?? {}) as Record<string, unknown>;

          const calledTsChanged =
            next.called_at && next.called_at !== prev.called_at;
          const isActiveCall = [
            'with_doctor',
            'sent_to_dispensary',
            'dispensing_payment',
          ].includes(next.clinic_status as string);

          if (!(calledTsChanged && isActiveCall)) {
            return;
          }

          const id = next.id as string;
          const eventKey = `${id}:${next.called_at}`;
          if (seenRef.current.has(eventKey)) return;
          seenRef.current.add(eventKey);

          const { data, error } = await supabase
            .from('queue_entries')
            .select(
              'id, queue_number, patients:patient_id(name), rooms:assigned_room_id(label)',
            )
            .eq('id', id)
            .maybeSingle();
          if (error || !data) return;

          const callBy = settings.queue_call_by ?? 'number';
          const patient = (data.patients as { name?: string } | null)?.name ?? 'Pesakit';
          const room = (data.rooms as { label?: string } | null)?.label ?? 'bilik konsultasi';
          const display =
            callBy === 'name'
              ? patient
              : `${data.queue_number ?? ''}`.trim();

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
  }, [started, settings.queue_call_by, isPreview]);

  const playDingDong = async (): Promise<void> => {
    if (isPreview) return;
    // Try the hosted chime first; resolve on `ended`, on a 3s safety cap,
    // or on error — whichever fires first — so the queue never hangs.
    try {
      const el = new Audio(CHIME_URL);
      el.volume = 0.6;
      await el.play();
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          el.removeEventListener('ended', finish);
          el.removeEventListener('error', finish);
          try { el.pause(); } catch { /* noop */ }
          resolve();
        };
        el.addEventListener('ended', finish);
        el.addEventListener('error', finish);
        window.setTimeout(finish, CHIME_MAX_MS);
      });
      return;
    } catch {
      /* fall through to synthesized fallback */
    }
    // Synthesized two-tone fallback (~1.1s total)
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      const tone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(0.4, now + start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.05);
      };
      tone(880, 0, 0.45); // ding
      tone(660, 0.5, 0.6); // dong
    } catch {
      /* noop */
    }
    await wait(1150);
  };

  const speakAnnouncement = async (next: CallEvent): Promise<void> => {
    if (isPreview) return;
    const callBy = settings.queue_call_by ?? 'number';
    const lang = (settings.tts_language ?? 'ms-MY') as 'ms-MY' | 'en-US';
    const isMalay = lang === 'ms-MY';
    const text = isMalay
      ? (callBy === 'name'
          ? `Pesakit, ${next.display}, sila ke, ${next.roomLabel}`
          : `Nombor giliran, ${next.display}, sila ke, ${next.roomLabel}`)
      : (callBy === 'name'
          ? `Patient, ${next.display}, please proceed to, ${next.roomLabel}`
          : `Queue number, ${next.display}, please proceed to, ${next.roomLabel}`);

    const voiceName = isMalay ? 'ms-MY-Wavenet-A' : 'en-US-Journey-F';

    try {
      // Stop any stale clip
      if (currentTtsAudioRef.current) {
        try { currentTtsAudioRef.current.pause(); } catch { /* noop */ }
        currentTtsAudioRef.current = null;
      }

      const { data, error } = await supabase.functions.invoke('generate-tts', {
        body: { text, languageCode: lang, voiceName },
      });

      if (error || !data?.audioContent) {
        console.error('TTS invoke failed', error);
        return;
      }

      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      currentTtsAudioRef.current = audio;
      audio.volume = 1;

      await new Promise<void>((resolve) => {
        const done = () => {
          audio.removeEventListener('ended', done);
          audio.removeEventListener('error', done);
          if (currentTtsAudioRef.current === audio) {
            currentTtsAudioRef.current = null;
          }
          resolve();
        };
        audio.addEventListener('ended', done);
        audio.addEventListener('error', done);
        audio.play().catch((e) => {
          console.error('TTS audio play failed', e);
          done();
        });
      });
    } catch (e) {
      console.error('speakAnnouncement error', e);
    }
  };

  const processQueue = async () => {
    if (playingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    playingRef.current = true;
    setRecentCalls((prev) => [...prev, next].slice(-3));

    await playDingDong();
    await wait(300);
    await speakAnnouncement(next);
    await wait(600);
    await speakAnnouncement(next); // repeat once for clarity

    playingRef.current = false;
    if (queueRef.current.length > 0) processQueue();
  };


  if (!started) {
    return (
      <div className="fixed inset-0 bg-slate-950 text-white flex flex-col items-center justify-center gap-6 p-8">
        <TvIcon className="h-20 w-20 text-blue-400" />
        <h1 className="text-4xl font-bold">Paparan TV Bilik Menunggu</h1>
        <p className="max-w-lg text-center text-slate-400">
          Mula paparan untuk membolehkan pengumuman panggilan pesakit. Audio
          memerlukan satu sentuhan untuk dimulakan.
        </p>
        <button
          onClick={() => {
            // Unlock autoplay on iOS/Safari with a silent play attempt
            try {
              const unlock = new Audio(
                'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7097deO9XHv/3Q1/jOR40cf/G/5/aphP/+/9/+///8/g//1/'
              );
              unlock.volume = 0;
              unlock.play().catch(() => { /* noop */ });
            } catch {
              /* noop */
            }
            setStarted(true);
          }}
          className="rounded-2xl bg-blue-600 hover:bg-blue-500 px-12 py-6 text-2xl font-semibold shadow-2xl transition-all hover:scale-105"
        >
          ▶ Mulakan Paparan TV
        </button>
      </div>
    );
  }

  const ytId = settings.tv_youtube_id?.trim();
  const ticker = settings.tv_ticker_text?.trim();

  // Build 3 row slots: index 0 = oldest (top), index 2 = newest (bottom).
  // Pad with nulls if fewer than 3 calls.
  const padded: (CallEvent | null)[] = [
    ...Array(Math.max(0, 3 - recentCalls.length)).fill(null),
    ...recentCalls,
  ].slice(-3);

  return (
    <div className="fixed inset-0 bg-slate-950 text-white flex overflow-hidden">

      {/* Left 65%: Video + ticker */}
      <div className="flex-[65] flex flex-col">
        <div className="flex-1 bg-black flex items-center justify-center relative">
          {ytId ? (
            <>
              <ReactPlayer
                key={ytId}
                src={`https://www.youtube.com/watch?v=${ytId}`}
                playing
                loop
                muted={isPreview}
                volume={videoVolume}
                width="100%"
                height="100%"
                controls={false}
              />
              {!isPreview && (
                <div className="absolute bottom-4 left-4 w-56 px-4 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-3 z-10">
                  <Volume2 className="h-4 w-4 text-white/80 shrink-0" />
                  <Slider
                    value={[videoVolume]}
                    max={1}
                    step={0.05}
                    onValueChange={(v) => setVideoVolume(v[0])}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="text-slate-500 text-center px-8">
              <TvIcon className="h-16 w-16 mx-auto mb-4 opacity-40" />
              <p>Tetapkan ID Video YouTube di Settings → Queue &amp; TV.</p>
            </div>
          )}
        </div>

        {/* Ticker */}
        <div className="h-14 bg-blue-900/80 border-t border-blue-700 flex items-center overflow-hidden">
          <div className="whitespace-nowrap animate-tv-marquee text-2xl font-medium px-6">
            {ticker || 'Selamat datang ke Klinik Awfa. Sila tunggu giliran anda.'}
          </div>
        </div>
      </div>

      {/* Right 35%: 3-row stack */}
      <div className="flex-[35] flex flex-col bg-gradient-to-b from-slate-900 to-slate-950 border-l border-slate-800">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-blue-400" />
          <span className="text-sm uppercase tracking-widest text-slate-400">
            Sedang Memanggil
          </span>
        </div>

        <div className="flex-1 flex flex-col p-4 gap-3">
          {padded.map((call, idx) => {
            const isNewest = idx === 2;
            const isMid = idx === 1;

            // Empty placeholder
            if (!call) {
              return (
                <div
                  key={`empty-${idx}`}
                  className={`flex-1 rounded-2xl border border-dashed border-slate-800 flex items-center justify-center text-slate-700 ${
                    isNewest ? 'min-h-[40%]' : ''
                  }`}
                >
                  <span className="text-3xl">—</span>
                </div>
              );
            }

            const opacityCls = isNewest
              ? 'opacity-100'
              : isMid
              ? 'opacity-70'
              : 'opacity-40';
            const borderCls = isNewest
              ? 'border-blue-400 bg-blue-950/30 shadow-[0_0_40px_rgba(59,130,246,0.35)]'
              : 'border-slate-800 bg-slate-900/40';
            const textSize = isNewest
              ? 'text-7xl'
              : isMid
              ? 'text-4xl'
              : 'text-3xl';
            const roomSize = isNewest ? 'text-3xl' : 'text-lg';
            const glow = isNewest
              ? 'drop-shadow-[0_0_30px_rgba(59,130,246,0.6)]'
              : '';

            return (
              <AnimatePresence mode="wait" key={`slot-${idx}`}>
                <motion.div
                  key={call.id}
                  initial={
                    isNewest
                      ? { scale: 0.85, opacity: 0, y: 20 }
                      : { opacity: 0, y: -10 }
                  }
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  className={`flex-1 rounded-2xl border-2 ${borderCls} ${opacityCls} flex items-center justify-between px-6 ${
                    isNewest ? 'min-h-[40%]' : ''
                  }`}
                >
                  <motion.div
                    animate={
                      isNewest
                        ? { scale: [1, 1.04, 1] }
                        : undefined
                    }
                    transition={
                      isNewest
                        ? { duration: 1.1, repeat: 3 }
                        : undefined
                    }
                    className={`font-black tracking-tight text-white ${textSize} ${glow}`}
                  >
                    {call.display}
                  </motion.div>
                  <div className={`text-right ${isNewest ? 'text-blue-300' : 'text-slate-400'}`}>
                    <div className={`${isNewest ? 'text-base' : 'text-xs'} uppercase tracking-widest opacity-70`}>
                      {isNewest ? 'Sila ke' : isMid ? 'Sebelum ini' : 'Lebih awal'}
                    </div>
                    <div className={`font-bold ${roomSize} ${isNewest ? 'text-blue-400' : ''}`}>
                      {call.roomLabel}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            );
          })}
        </div>
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
