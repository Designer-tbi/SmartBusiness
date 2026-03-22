import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface PortfolioItem {
  id: number;
  name: string;
  sub_type?: string;
  address?: string;
  city?: string;
  tel?: string;
}

interface MapViewProps {
  items: PortfolioItem[];
}

// Rough coordinates for cities
const CITY_COORDS: Record<string, [number, number]> = {
  'BRAZZAVILLE': [-4.2699, 15.2832],
  'POINTE-NOIRE': [-4.7988, 11.8501],
};

export default function MapView({ items }: MapViewProps) {
  const [markers, setMarkers] = useState<(PortfolioItem & { lat: number; lng: number })[]>([]);

  useEffect(() => {
    // Generate rough coordinates with slight random offsets so markers don't overlap completely
    const newMarkers = items.map((item, index) => {
      const baseCoords = item.city && CITY_COORDS[item.city.toUpperCase()] 
        ? CITY_COORDS[item.city.toUpperCase()] 
        : [-4.2699, 15.2832]; // Default to Brazzaville
      
      // Add a small deterministic offset based on index to spread them out slightly
      // This is a placeholder since we don't have exact coordinates
      const offsetLat = (Math.sin(index * 123.456) * 0.05);
      const offsetLng = (Math.cos(index * 123.456) * 0.05);

      return {
        ...item,
        lat: baseCoords[0] + offsetLat,
        lng: baseCoords[1] + offsetLng,
      };
    });
    setMarkers(newMarkers);
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <p>Les emplacements sur la carte sont approximatifs car les coordonnées GPS exactes ne sont pas disponibles.</p>
      </div>
      <div className="h-[600px] w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm relative z-0">
        <MapContainer center={[-4.5, 13.5]} zoom={6} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markers.map((item) => (
            <Marker key={item.id} position={[item.lat, item.lng]}>
              <Popup>
                <div className="p-1">
                  <h3 className="font-bold text-slate-800">{item.name}</h3>
                  {item.sub_type && <p className="text-xs text-indigo-600 font-semibold mt-1">{item.sub_type}</p>}
                  {item.address && <p className="text-sm text-slate-600 mt-2">{item.address}</p>}
                  {item.city && <p className="text-sm text-slate-600">{item.city}</p>}
                  {item.tel && <p className="text-sm text-slate-600 mt-1">{item.tel}</p>}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
