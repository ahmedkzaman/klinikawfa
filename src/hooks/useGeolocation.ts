import { useState, useCallback } from 'react';

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  isLoading: boolean;
  timestamp: number | null;
}

interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

const defaultOptions: UseGeolocationOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

export function useGeolocation(options: UseGeolocationOptions = {}) {
  const [state, setState] = useState<GeolocationState>({
    latitude: null, longitude: null, accuracy: null, error: null, isLoading: false, timestamp: null,
  });

  const mergedOptions = { ...defaultOptions, ...options };

  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({ ...prev, error: 'Geolocation is not supported by your browser', isLoading: false }));
      return;
    }
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          latitude: position.coords.latitude, longitude: position.coords.longitude,
          accuracy: position.coords.accuracy, error: null, isLoading: false, timestamp: position.timestamp,
        });
      },
      (error) => {
        let errorMessage = 'An unknown error occurred';
        switch (error.code) {
          case error.PERMISSION_DENIED: errorMessage = 'Location permission denied. Please enable location access.'; break;
          case error.POSITION_UNAVAILABLE: errorMessage = 'Location information is unavailable.'; break;
          case error.TIMEOUT: errorMessage = 'Location request timed out. Please try again.'; break;
        }
        setState((prev) => ({ ...prev, error: errorMessage, isLoading: false }));
      },
      { enableHighAccuracy: mergedOptions.enableHighAccuracy, timeout: mergedOptions.timeout, maximumAge: mergedOptions.maximumAge }
    );
  }, [mergedOptions.enableHighAccuracy, mergedOptions.timeout, mergedOptions.maximumAge]);

  const clearError = useCallback(() => { setState((prev) => ({ ...prev, error: null })); }, []);

  return { ...state, getCurrentPosition, clearError, isSupported: typeof navigator !== 'undefined' && 'geolocation' in navigator };
}
