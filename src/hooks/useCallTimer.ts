import { useState, useEffect, useCallback, useRef } from 'react';

interface UseCallTimerOptions {
  depositAmount: number; // in cents
  perMinuteRate: number; // in cents
  freeMinutes: number;
  onTick?: (seconds: number) => void;
}

interface UseCallTimerReturn {
  seconds: number;
  formattedTime: string;
  totalMinutes: number;
  chargeableMinutes: number;
  currentCost: number;
  additionalCost: number;
  isOverFreeTime: boolean;
  start: () => void;
  pause: () => void;
  stop: () => number;
  reset: () => void;
  isRunning: boolean;
}

export function useCallTimer({
  depositAmount,
  perMinuteRate,
  freeMinutes,
  onTick,
}: UseCallTimerOptions): UseCallTimerReturn {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const formatTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalMinutes = Math.ceil(seconds / 60);
  const chargeableMinutes = Math.max(0, totalMinutes - freeMinutes);
  const additionalCost = chargeableMinutes * perMinuteRate;
  const currentCost = depositAmount + additionalCost;
  const isOverFreeTime = seconds > freeMinutes * 60;

  const start = useCallback(() => {
    if (!isRunning) {
      setIsRunning(true);
      startTimeRef.current = Date.now() - seconds * 1000;
      
      intervalRef.current = window.setInterval(() => {
        setSeconds((prev) => {
          const newSeconds = prev + 1;
          onTick?.(newSeconds);
          return newSeconds;
        });
      }, 1000);
    }
  }, [isRunning, seconds, onTick]);

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    return seconds;
  }, [seconds]);

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSeconds(0);
    setIsRunning(false);
    startTimeRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    seconds,
    formattedTime: formatTime(seconds),
    totalMinutes,
    chargeableMinutes,
    currentCost,
    additionalCost,
    isOverFreeTime,
    start,
    pause,
    stop,
    reset,
    isRunning,
  };
}
