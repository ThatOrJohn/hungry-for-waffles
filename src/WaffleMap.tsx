import React, { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getMapRadius, RADIUS_OPTIONS, type RadiusOption } from "./utils/units";

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Biloxi, MS coordinates (default location)
const BILOXI_COORDS: [number, number] = [30.3944, -88.8853];

// Southeast US bounds for initial view
const SOUTHEAST_BOUNDS: L.LatLngBoundsExpression = [
  [25.0, -85.0], // Southwest
  [35.0, -75.0], // Northeast
];

interface Location {
  lat: number;
  lng: number;
  name?: string;
}

// Component to handle map center updates
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, 12);
  }, [center, map]);

  return null;
}

const WaffleMap: React.FC = () => {
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRadius, setSelectedRadius] = useState<RadiusOption>(10);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Get user's current location
  const getCurrentLocation = () => {
    setIsLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser");
      setUserLocation({ ...BILOXI_COORDS, name: "Biloxi, MS (Default)" });
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({
          lat: latitude,
          lng: longitude,
          name: "Your Location",
        });
        setIsLoading(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        setError("Unable to get your location. Using default location.");
        setUserLocation({ ...BILOXI_COORDS, name: "Biloxi, MS (Default)" });
        setIsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  // Search for location using OpenStreetMap Nominatim API
  const searchLocation = async () => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=1`
      );
      const data = await response.json();

      if (data && data.length > 0) {
        const result = data[0];
        const newLocation: Location = {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
          name: result.display_name,
        };
        setUserLocation(newLocation);
        setSearchQuery("");
      } else {
        setError("Location not found. Please try a different search term.");
      }
    } catch (err) {
      setError("Error searching for location. Please try again.");
      console.error("Search error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize with user location on component mount
  useEffect(() => {
    getCurrentLocation();
  }, []);

  const currentCenter: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : BILOXI_COORDS;

  return (
    <div className="h-screen w-full relative">
      {/* Search Controls */}
      <div className="absolute top-4 left-4 z-[1000] bg-white rounded-lg shadow-lg p-4 max-w-sm">
        <div className="space-y-3">
          <div className="flex space-x-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a location..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => e.key === "Enter" && searchLocation()}
            />
            <button
              onClick={searchLocation}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? "..." : "Search"}
            </button>
          </div>

          <button
            onClick={getCurrentLocation}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
          >
            {isLoading ? "Getting Location..." : "Use My Location"}
          </button>

          {/* Radius Selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Search Radius: {selectedRadius} mile{selectedRadius === 1 ? '' : 's'}
            </label>
            <div className="relative">
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={selectedRadius}
                onChange={(e) => setSelectedRadius(Number(e.target.value) as RadiusOption)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1 mi</span>
                <span>10 mi</span>
                <span>25 mi</span>
                <span>50 mi</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <MapContainer
        center={currentCenter}
        zoom={12}
        className="h-full w-full"
        ref={mapRef}
        bounds={SOUTHEAST_BOUNDS}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapUpdater center={currentCenter} />

        {userLocation && (
          <>
            <Marker position={[userLocation.lat, userLocation.lng]}>
              <Popup>
                <div>
                  <h3 className="font-semibold">{userLocation.name}</h3>
                  <p className="text-sm text-gray-600">
                    {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
                  </p>
                </div>
              </Popup>
            </Marker>

            {/* Search radius circle */}
            <Circle
              center={[userLocation.lat, userLocation.lng]}
              radius={getMapRadius(selectedRadius)}
              pathOptions={{
                color: "blue",
                fillColor: "blue",
                fillOpacity: 0.1,
                weight: 2,
              }}
            >
              <Popup>
                <div>
                  <h3 className="font-semibold">
                    {selectedRadius}-Mile Radius
                  </h3>
                  <p className="text-sm text-gray-600">
                    This circle shows a {selectedRadius}-mile radius around{" "}
                    {userLocation.name}
                  </p>
                </div>
              </Popup>
            </Circle>
          </>
        )}
      </MapContainer>
    </div>
  );
};

export default WaffleMap;
