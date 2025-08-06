// Utility functions for US units (feet, miles, etc.)

/**
 * Convert meters to miles
 */
export const metersToMiles = (meters: number): number => {
  return meters / 1609.34;
};

/**
 * Convert miles to meters
 */
export const milesToMeters = (miles: number): number => {
  return miles * 1609.34;
};

/**
 * Convert meters to feet
 */
export const metersToFeet = (meters: number): number => {
  return meters * 3.28084;
};

/**
 * Convert feet to meters
 */
export const feetToMeters = (feet: number): number => {
  return feet / 3.28084;
};

/**
 * Format distance in a human-readable way
 * Returns the most appropriate unit (feet for short distances, miles for longer)
 */
export const formatDistance = (meters: number): string => {
  const miles = metersToMiles(meters);
  const feet = metersToFeet(meters);

  if (miles >= 1) {
    return `${miles.toFixed(1)} mile${miles === 1 ? '' : 's'}`;
  } else if (feet >= 100) {
    return `${Math.round(feet)} feet`;
  } else {
    return `${Math.round(feet)} feet`;
  }
};

/**
 * Format distance with specific unit preference
 */
export const formatDistanceInMiles = (meters: number): string => {
  const miles = metersToMiles(meters);
  return `${miles.toFixed(1)} mile${miles === 1 ? '' : 's'}`;
};

export const formatDistanceInFeet = (meters: number): string => {
  const feet = metersToFeet(meters);
  return `${Math.round(feet)} feet`;
};

/**
 * Calculate distance between two points in meters using Haversine formula
 */
export const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Get the appropriate radius for map circles in meters
 * Converts from miles to meters for Leaflet
 */
export const getMapRadius = (miles: number): number => {
  return milesToMeters(miles);
};

/**
 * Common radius options in miles
 */
export const RADIUS_OPTIONS = [
  { value: 1, label: '1 mile' },
  { value: 5, label: '5 miles' },
  { value: 10, label: '10 miles' },
  { value: 25, label: '25 miles' },
  { value: 50, label: '50 miles' },
] as const;

export type RadiusOption = typeof RADIUS_OPTIONS[number]['value']; 