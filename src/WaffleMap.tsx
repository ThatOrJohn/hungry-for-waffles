import React, { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import axios from "axios";
import { getMapRadius, type RadiusOption } from "./utils/units";

// Fix for default marker icons
delete (L.Icon.Default.prototype as { _getIconUrl?: string })._getIconUrl;
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

// Haversine distance calculation function
const haversineDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Greedy nearest-neighbor algorithm for TSP
const solveHungryForWaffles = (
  userLat: number,
  userLng: number,
  waffleHouses: WaffleHouse[]
): { route: WaffleHouse[]; totalDistance: number } => {
  if (waffleHouses.length === 0) {
    return { route: [], totalDistance: 0 };
  }

  const unvisited = [...waffleHouses];
  const route: WaffleHouse[] = [];
  let currentLat = userLat;
  let currentLng = userLng;
  let totalDistance = 0;

  while (unvisited.length > 0) {
    // Find the nearest unvisited Waffle House
    let nearestIndex = 0;
    let nearestDistance = haversineDistance(
      currentLat,
      currentLng,
      unvisited[0].latitude,
      unvisited[0].longitude
    );

    for (let i = 1; i < unvisited.length; i++) {
      const distance = haversineDistance(
        currentLat,
        currentLng,
        unvisited[i].latitude,
        unvisited[i].longitude
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    // Add the nearest Waffle House to the route
    const nearest = unvisited.splice(nearestIndex, 1)[0];
    route.push(nearest);
    totalDistance += nearestDistance;

    // Update current position
    currentLat = nearest.latitude;
    currentLng = nearest.longitude;
  }

  return { route, totalDistance };
};

// Helper function to call the ORS Directions API
async function getORSRoute(
  coordinates: [number, number][]
): Promise<number[][]> {
  const apiKey = import.meta.env.VITE_OPENROUTE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenRouteService API key not found. Please add VITE_OPENROUTE_API_KEY to your .env file."
    );
  }

  const res = await axios.post(
    "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
    {
      coordinates, // [lng, lat] format
    },
    {
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
    }
  );

  // Return the list of [lng, lat] points from the route geometry
  return res.data.features[0].geometry.coordinates;
}

interface Location {
  lat: number;
  lng: number;
  name?: string;
}

interface WaffleHouse {
  id: string;
  store_code: string;
  business_name: string;
  latitude: number;
  longitude: number;
  address: string;
}

interface WaffleHouseResponse {
  success: boolean;
  data: WaffleHouse[];
  count: number;
  query: {
    latitude: number;
    longitude: number;
    radius: number;
    radiusMeters: number;
  };
}

// Component to handle map center updates and bounds fitting
function MapUpdater({
  center,
  waffleHouses,
  userLocation,
}: {
  center: [number, number];
  waffleHouses: WaffleHouse[];
  userLocation: Location | null;
}) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, 12);
  }, [center, map]);

  // Fit bounds to show all markers when waffle houses are loaded
  useEffect(() => {
    if (waffleHouses.length > 0 && userLocation) {
      const bounds = L.latLngBounds([
        [userLocation.lat, userLocation.lng] as [number, number], // Include user location
        ...waffleHouses.map(
          (wh) => [wh.latitude, wh.longitude] as [number, number]
        ), // Include all waffle houses
      ]);

      // Add some padding to the bounds
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [waffleHouses, userLocation, map]);

  return null;
}

const WaffleMap: React.FC = () => {
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRadius, setSelectedRadius] = useState<RadiusOption>(10);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingWaffleHouses, setIsLoadingWaffleHouses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waffleHouses, setWaffleHouses] = useState<WaffleHouse[]>([]);
  const [waffleHouseError, setWaffleHouseError] = useState<string | null>(null);
  const [route, setRoute] = useState<WaffleHouse[]>([]);
  const [totalDistance, setTotalDistance] = useState<number>(0);
  const [realRouteCoordinates, setRealRouteCoordinates] = useState<
    [number, number][]
  >([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeStats, setRouteStats] = useState<{
    distance: number;
    duration: number;
  } | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Fetch nearby Waffle Houses
  const fetchWaffleHouses = async (
    lat: number,
    lng: number,
    radius: number
  ) => {
    setIsLoadingWaffleHouses(true);
    setWaffleHouseError(null);

    try {
      const response = await fetch(
        `/api/waffle_houses?lat=${lat}&lng=${lng}&radius=${radius}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: WaffleHouseResponse = await response.json();

      if (data.success) {
        setWaffleHouses(data.data);

        // Solve the "Hungry for Waffles Problem" when we have waffle houses
        if (data.data.length > 0) {
          const { route: calculatedRoute, totalDistance: calculatedDistance } =
            solveHungryForWaffles(lat, lng, data.data);
          setRoute(calculatedRoute);
          setTotalDistance(calculatedDistance);

          // Get real road route from OpenRouteService
          await fetchRealRoute(lat, lng, calculatedRoute);
        } else {
          setRoute([]);
          setTotalDistance(0);
          setRealRouteCoordinates([]);
          setRouteStats(null);
        }
      } else {
        throw new Error("Failed to fetch Waffle Houses");
      }
    } catch (err) {
      console.error("Error fetching Waffle Houses:", err);
      setWaffleHouseError(
        err instanceof Error
          ? err.message
          : "Failed to fetch nearby Waffle Houses"
      );
      setWaffleHouses([]);
    } finally {
      setIsLoadingWaffleHouses(false);
    }
  };

  // Fetch real road route from OpenRouteService
  const fetchRealRoute = async (
    userLat: number,
    userLng: number,
    waffleRoute: WaffleHouse[]
  ) => {
    if (waffleRoute.length === 0) return;

    setIsLoadingRoute(true);
    setRouteError(null);

    try {
      // Build coordinates array starting from user location, then all waffle houses in route order
      const coordinates: [number, number][] = [
        [userLng, userLat], // Start from user location [lng, lat]
        ...waffleRoute.map((wh): [number, number] => [
          wh.longitude,
          wh.latitude,
        ]), // Add all waffle houses [lng, lat]
      ];

      const routeCoordinates = await getORSRoute(coordinates);

      // Convert [lng, lat] back to [lat, lng] for Leaflet
      const leafletCoordinates: [number, number][] = routeCoordinates
        .filter((coord): coord is [number, number] => coord.length >= 2)
        .map((coord): [number, number] => [coord[1], coord[0]]); // [lat, lng]

      setRealRouteCoordinates(leafletCoordinates);

      // Extract route statistics if available
      try {
        const apiKey = import.meta.env.VITE_OPENROUTE_API_KEY;
        const res = await axios.post(
          "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
          { coordinates },
          {
            headers: {
              Authorization: apiKey,
              "Content-Type": "application/json",
            },
          }
        );

        const summary = res.data.features[0].properties.summary;
        setRouteStats({
          distance: summary.distance / 1609.34, // Convert meters to miles
          duration: summary.duration / 60, // Convert seconds to minutes
        });
      } catch (statsError) {
        console.warn("Could not fetch route statistics:", statsError);
        setRouteStats(null);
      }
    } catch (err) {
      console.error("Error fetching real route:", err);
      setRouteError(
        "Failed to get real road route. Showing straight-line route instead."
      );
      setRealRouteCoordinates([]);
      setRouteStats(null);
    } finally {
      setIsLoadingRoute(false);
    }
  };

  // Get user's current location
  const getCurrentLocation = () => {
    setIsLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser");
      setUserLocation({
        lat: BILOXI_COORDS[0],
        lng: BILOXI_COORDS[1],
        name: "Biloxi, MS (Default)",
      });
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
        setUserLocation({
          lat: BILOXI_COORDS[0],
          lng: BILOXI_COORDS[1],
          name: "Biloxi, MS (Default)",
        });
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

  // Fetch Waffle Houses when location or radius changes
  useEffect(() => {
    if (userLocation) {
      fetchWaffleHouses(userLocation.lat, userLocation.lng, selectedRadius);
    }
  }, [userLocation, selectedRadius]);

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
              Search Radius: {selectedRadius} mile
              {selectedRadius === 1 ? "" : "s"}
            </label>
            <div className="relative">
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={selectedRadius}
                onChange={(e) =>
                  setSelectedRadius(Number(e.target.value) as RadiusOption)
                }
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

          {/* Waffle House Status */}
          <div className="text-sm">
            {isLoadingWaffleHouses ? (
              <div className="text-blue-600">Loading Waffle Houses...</div>
            ) : waffleHouses.length > 0 ? (
              <div className="text-green-600">
                Found {waffleHouses.length} Waffle House
                {waffleHouses.length === 1 ? "" : "s"}
              </div>
            ) : waffleHouseError ? (
              <div className="text-red-600">{waffleHouseError}</div>
            ) : userLocation ? (
              <div className="text-gray-600">
                No Waffle Houses found in this area
              </div>
            ) : null}
          </div>

          {/* Route Information */}
          {route.length > 0 && (
            <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
              <h3 className="font-semibold text-blue-800 mb-2">
                🍳 Hungry for Waffles Route
              </h3>
              <div className="text-sm text-blue-700 space-y-1">
                <div>📍 {route.length} stops</div>
                <div>🛣️ Total distance: {totalDistance.toFixed(1)} miles</div>
                {routeStats && (
                  <>
                    <div>
                      🚗 Road distance: {routeStats.distance.toFixed(1)} miles
                    </div>
                    <div>
                      ⏱️ Estimated time: {routeStats.duration.toFixed(0)}{" "}
                      minutes
                    </div>
                  </>
                )}
                {isLoadingRoute && (
                  <div className="text-blue-600">
                    🔄 Loading real road route...
                  </div>
                )}
                {routeError && (
                  <div className="text-orange-600 text-xs">{routeError}</div>
                )}
                <div className="text-xs text-blue-600 mt-2">
                  Route follows greedy nearest-neighbor algorithm
                  {realRouteCoordinates.length > 0 && " with real road paths"}
                </div>
              </div>
            </div>
          )}

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

        <MapUpdater
          center={currentCenter}
          waffleHouses={waffleHouses}
          userLocation={userLocation}
        />

        {userLocation && (
          <>
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={
                new L.Icon({
                  iconUrl:
                    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiMyNTYzZWYiLz4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iNiIgZmlsbD0id2hpdGUiLz4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMyIgZmlsbD0iIzI1NjNlZiIvPgo8L3N2Zz4K",
                  iconSize: [24, 24],
                  iconAnchor: [12, 12],
                  popupAnchor: [0, -12],
                })
              }
            >
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

        {/* Waffle House Markers */}
        {waffleHouses.map((waffleHouse) => {
          const routeIndex = route.findIndex((wh) => wh.id === waffleHouse.id);
          const isInRoute = routeIndex !== -1;

          return (
            <Marker
              key={waffleHouse.id}
              position={[waffleHouse.latitude, waffleHouse.longitude]}
              icon={
                new L.Icon({
                  iconUrl:
                    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
                  iconRetinaUrl:
                    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
                  shadowUrl:
                    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
                  iconSize: [25, 41],
                  iconAnchor: [12, 41],
                  popupAnchor: [1, -34],
                  shadowSize: [41, 41],
                })
              }
            >
              <Popup>
                <div>
                  <h3 className="font-semibold text-lg">
                    {waffleHouse.business_name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    Store #{waffleHouse.store_code}
                  </p>
                  {isInRoute && (
                    <p className="text-sm font-medium text-blue-600 mb-1">
                      🍳 Stop #{routeIndex + 1} on route
                    </p>
                  )}
                  <p className="text-sm">{waffleHouse.address}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {waffleHouse.latitude.toFixed(6)},{" "}
                    {waffleHouse.longitude.toFixed(6)}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Route Polyline */}
        {route.length > 0 && userLocation && (
          <>
            {/* Real road route from OpenRouteService */}
            {realRouteCoordinates.length > 0 && (
              <Polyline
                positions={realRouteCoordinates}
                pathOptions={{
                  color: "red",
                  weight: 4,
                  opacity: 0.8,
                }}
              >
                <Popup>
                  <div>
                    <h3 className="font-semibold text-lg">
                      🍳 Real Road Route
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      Actual driving route visiting all {route.length} Waffle
                      Houses
                    </p>
                    {routeStats && (
                      <>
                        <p className="text-sm font-medium">
                          Road Distance: {routeStats.distance.toFixed(1)} miles
                        </p>
                        <p className="text-sm font-medium">
                          Estimated Time: {routeStats.duration.toFixed(0)}{" "}
                          minutes
                        </p>
                      </>
                    )}
                    <div className="text-xs text-gray-500 mt-2">
                      <p>Route order:</p>
                      <ol className="list-decimal list-inside mt-1">
                        {route.map((wh, index) => (
                          <li key={wh.id} className="truncate">
                            {index + 1}. {wh.business_name}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </Popup>
              </Polyline>
            )}

            {/* Fallback straight-line route if real route failed */}
            {realRouteCoordinates.length === 0 && !isLoadingRoute && (
              <Polyline
                positions={[
                  [userLocation.lat, userLocation.lng],
                  ...route.map(
                    (wh) => [wh.latitude, wh.longitude] as [number, number]
                  ),
                ]}
                pathOptions={{
                  color: "orange",
                  weight: 3,
                  opacity: 0.8,
                  dashArray: "5, 10",
                }}
              >
                <Popup>
                  <div>
                    <h3 className="font-semibold text-lg">
                      🍳 Straight-Line Route
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      Direct route visiting all {route.length} Waffle Houses
                    </p>
                    <p className="text-sm font-medium">
                      Total Distance: {totalDistance.toFixed(1)} miles
                    </p>
                    {routeError && (
                      <p className="text-xs text-orange-600 mt-1">
                        {routeError}
                      </p>
                    )}
                    <div className="text-xs text-gray-500 mt-2">
                      <p>Route order:</p>
                      <ol className="list-decimal list-inside mt-1">
                        {route.map((wh, index) => (
                          <li key={wh.id} className="truncate">
                            {index + 1}. {wh.business_name}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </Popup>
              </Polyline>
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
};

export default WaffleMap;
