/**
 * Geofence utility functions using the Haversine formula
 */

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface GeofenceZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

interface GeofenceResult {
  isWithinZone: boolean;
  zone: GeofenceZone | null;
  distance: number;
  nearestZone: GeofenceZone | null;
}

export function calculateDistance(point1: Coordinates, point2: Coordinates): number {
  const R = 6371000;
  const lat1Rad = toRadians(point1.latitude);
  const lat2Rad = toRadians(point2.latitude);
  const deltaLat = toRadians(point2.latitude - point1.latitude);
  const deltaLon = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function checkGeofence(userLocation: Coordinates, zones: GeofenceZone[]): GeofenceResult {
  let nearestZone: GeofenceZone | null = null;
  let nearestDistance = Infinity;
  let matchingZone: GeofenceZone | null = null;

  for (const zone of zones) {
    const distance = calculateDistance(userLocation, { latitude: zone.latitude, longitude: zone.longitude });
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestZone = zone;
    }
    if (distance <= zone.radius_meters) {
      matchingZone = zone;
      break;
    }
  }

  return { isWithinZone: matchingZone !== null, zone: matchingZone, distance: nearestDistance, nearestZone };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function getAccuracyStatus(accuracy: number): { status: 'good' | 'fair' | 'poor'; message: string } {
  if (accuracy <= 10) return { status: 'good', message: 'Excellent GPS accuracy' };
  if (accuracy <= 30) return { status: 'good', message: 'Good GPS accuracy' };
  if (accuracy <= 50) return { status: 'fair', message: 'Fair GPS accuracy' };
  return { status: 'poor', message: 'Poor GPS accuracy - move to an open area' };
}
