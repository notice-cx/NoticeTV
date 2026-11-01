import { useState } from 'react';
import { Check, ChevronRight, LoaderCircle, MapPin, Search } from 'lucide-react';
import { z } from 'zod';
import type { WeatherLocation } from '../shared/rich-widgets';
import { Field } from './Field';

const placesSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        admin1: z.string().optional(),
      }),
    )
    .optional(),
});
type Place = NonNullable<z.infer<typeof placesSchema>['results']>[number];
export function LocationSearch({
  value,
  change,
  label = 'Location',
  searchLabel = 'Search locations',
  clear,
}: {
  value: WeatherLocation | null;
  change: (location: WeatherLocation) => void;
  label?: string;
  searchLabel?: string;
  clear?: () => void;
}) {
  const [query, setQuery] = useState(value?.location || '');
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function search() {
    if (query.trim().length < 2 || busy) return;
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({
        name: query.trim(),
        count: '5',
        language: 'en',
        format: 'json',
      });
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error();
      const data = placesSchema.parse(await response.json());
      setPlaces(data.results || []);
      if (!data.results?.length) setError('No locations found. Try a nearby town or city.');
    } catch {
      setError('Location search is unavailable. Try again when your connection returns.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Field label={label}>
        <div className="search-field">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a town or city"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void search();
              }
            }}
          />
          <button
            className="icon-button"
            onClick={() => {
              void search();
            }}
            disabled={busy || query.trim().length < 2}
            aria-label={searchLabel}
          >
            {busy ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}
          </button>
        </div>
      </Field>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {places.length > 0 && (
        <div className="place-results">
          {places.map((place) => (
            <button
              key={place.id}
              onClick={() => {
                change({
                  location: place.name,
                  latitude: place.latitude,
                  longitude: place.longitude,
                });
                setQuery(place.name);
                setPlaces([]);
              }}
            >
              <MapPin size={13} />
              <span>
                {place.name}
                <small>{[place.admin1, place.country].filter(Boolean).join(', ')}</small>
              </span>
              <ChevronRight size={12} />
            </button>
          ))}
        </div>
      )}
      {value && (
        <div className="connected-location">
          <Check size={12} />
          <span>
            {value.location}
            <small>Forecast connected</small>
          </span>
        </div>
      )}
      {value && clear && (
        <button
          className="text-button"
          onClick={() => {
            clear();
            setQuery('');
            setPlaces([]);
          }}
        >
          Remove location
        </button>
      )}
    </>
  );
}
