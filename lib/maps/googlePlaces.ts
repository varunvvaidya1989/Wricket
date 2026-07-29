const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export interface GooglePlaceSuggestion {
  placeId: string;
  text: string;
}

export interface GooglePlaceDetails {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  googleMapsUrl: string;
}

function apiKey(): string {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps is not configured. Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.');
  }
  return GOOGLE_MAPS_API_KEY;
}

export async function searchGooglePlaces(input: string): Promise<GooglePlaceSuggestion[]> {
  if (input.trim().length < 3) return [];
  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey(),
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
    },
    body: JSON.stringify({ input: input.trim() }),
  });
  if (!response.ok) throw new Error('Could not search Google Maps locations.');
  const body = await response.json() as {
    suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[];
  };
  return (body.suggestions ?? []).flatMap(item => {
    const prediction = item.placePrediction;
    return prediction?.placeId && prediction.text?.text
      ? [{ placeId: prediction.placeId, text: prediction.text.text }]
      : [];
  });
}

export async function getGooglePlace(placeId: string): Promise<GooglePlaceDetails> {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': apiKey(),
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,googleMapsUri',
    },
  });
  if (!response.ok) throw new Error('Could not load the selected Google Maps location.');
  const place = await response.json() as {
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    googleMapsUri?: string;
  };
  if (place.location?.latitude == null || place.location.longitude == null) {
    throw new Error('The selected place has no map coordinates.');
  }
  return {
    placeId: place.id,
    name: place.displayName?.text ?? place.formattedAddress ?? 'Tournament venue',
    address: place.formattedAddress ?? place.displayName?.text ?? 'Tournament venue',
    latitude: place.location.latitude,
    longitude: place.location.longitude,
    googleMapsUrl: place.googleMapsUri
      ?? `https://www.google.com/maps/search/?api=1&query=${place.location.latitude},${place.location.longitude}&query_place_id=${encodeURIComponent(place.id)}`,
  };
}

export function googleStaticMapUrl(latitude: number, longitude: number): string | undefined {
  if (!GOOGLE_MAPS_API_KEY) return undefined;
  const marker = encodeURIComponent(`color:red|${latitude},${longitude}`);
  return `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=15&size=640x280&scale=2&maptype=roadmap&markers=${marker}&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
}
