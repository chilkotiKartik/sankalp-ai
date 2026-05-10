export interface DistrictCenter {
  lat: number;
  lng: number;
  zoom: number;
}

export const DISTRICT_CENTERS: Record<string, DistrictCenter> = {
  "Dehradun":          { lat: 30.3165, lng: 78.0322, zoom: 11 },
  "Haridwar":          { lat: 29.9457, lng: 78.1642, zoom: 11 },
  "Tehri Garhwal":     { lat: 30.3783, lng: 78.4801, zoom: 10 },
  "Pauri Garhwal":     { lat: 30.1546, lng: 78.7747, zoom: 10 },
  "Rudraprayag":       { lat: 30.2846, lng: 78.9820, zoom: 10 },
  "Chamoli":           { lat: 30.4019, lng: 79.3210, zoom: 10 },
  "Uttarkashi":        { lat: 30.7268, lng: 78.4354, zoom: 10 },
  "Pithoragarh":       { lat: 29.5829, lng: 80.2178, zoom: 10 },
  "Bageshwar":         { lat: 29.8374, lng: 79.7712, zoom: 11 },
  "Almora":            { lat: 29.5971, lng: 79.6591, zoom: 11 },
  "Champawat":         { lat: 29.3336, lng: 80.0909, zoom: 11 },
  "Nainital":          { lat: 29.3919, lng: 79.4542, zoom: 11 },
  "Udham Singh Nagar": { lat: 28.9945, lng: 79.5224, zoom: 11 },
};

export const UK_CENTER: DistrictCenter = { lat: 30.0668, lng: 79.0193, zoom: 8 };

export function getDistrictCenter(district?: string | null): { lat: number; lng: number } {
  if (district && DISTRICT_CENTERS[district]) {
    const d = DISTRICT_CENTERS[district];
    return { lat: d.lat, lng: d.lng };
  }
  return { lat: UK_CENTER.lat, lng: UK_CENTER.lng };
}

export function getDistrictCenterFull(district?: string | null): DistrictCenter {
  if (district && DISTRICT_CENTERS[district]) return DISTRICT_CENTERS[district];
  return UK_CENTER;
}

export const ALL_DISTRICTS = Object.keys(DISTRICT_CENTERS);
