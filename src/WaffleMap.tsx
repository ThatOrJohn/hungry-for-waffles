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

// Types for OpenRouteService Optimization API
interface ORSJob {
  id: number;
  location: [number, number]; // [lng, lat]
}

interface ORSVehicle {
  id: number;
  start: [number, number]; // [lng, lat]
  return_to_depot: boolean;
  profile?: string; // Optional profile for OpenRouteService (defaults to "car" in VROOM)
}

interface ORSOptimizationRequest {
  jobs: ORSJob[];
  vehicles: ORSVehicle[];
}

interface ORSOptimizationResponse {
  unassigned: unknown[];
  routes: Array<{
    vehicle: number;
    steps: Array<{
      job: number;
      arrival: number;
      duration: number;
      distance: number;
    }>;
    distance: number;
    duration: number;
    geometry: string; // Encoded polyline
  }>;
}

// Simple polyline decoder for route geometry
const decodePolyline = (encoded: string): [number, number][] => {
  const poly: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0,
    lng = 0;

  while (index < len) {
    let shift = 0,
      result = 0;

    do {
      const b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (result >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      const b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (result >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push([lat / 1e3, lng / 1e3]);
  }

  return poly;
};

// Get optimized route using OpenRouteService Optimization API
const getOptimizedWaffleRoute = async (
  start: [number, number],
  waffleHouses: WaffleHouse[]
): Promise<{
  optimizedRoute: WaffleHouse[];
  routeGeometry: [number, number][];
  totalDistance: number;
  totalDuration: number;
}> => {
  const apiKey = import.meta.env.VITE_OPENROUTE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenRouteService API key not found. Please add VITE_OPENROUTE_API_KEY to your .env file."
    );
  }

  if (waffleHouses.length === 0) {
    return {
      optimizedRoute: [],
      routeGeometry: [],
      totalDistance: 0,
      totalDuration: 0,
    };
  }

  // Prepare jobs for the optimization API
  const jobs: ORSJob[] = waffleHouses.map((wh, index) => ({
    id: index + 1,
    location: [wh.longitude, wh.latitude] as [number, number], // [lng, lat]
  }));

  // Prepare vehicle (starting from user location)
  const vehicles: ORSVehicle[] = [
    {
      id: 1,
      start: [start[1], start[0]] as [number, number], // Convert [lat, lng] to [lng, lat]
      return_to_depot: false,
      profile: "driving-car", // Explicitly set the profile for OpenRouteService
    },
  ];

  const requestBody: ORSOptimizationRequest = {
    jobs,
    vehicles,
  };

  try {
    const response = await axios.post<ORSOptimizationResponse>(
      "https://api.openrouteservice.org/optimization",
      {
        ...requestBody,
        options: {
          g: true, // Include geometry
        },
      },
      {
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    const route = response.data.routes[0];
    if (!route || !route.steps || route.steps.length === 0) {
      throw new Error("No route found in optimization response");
    }

    // Map the optimized job order back to Waffle House data
    const optimizedRoute: WaffleHouse[] = route.steps
      .filter((step) => step.job !== undefined) // Filter out depot steps
      .map((step) => waffleHouses[step.job - 1]); // job IDs are 1-indexed

    // Decode the route geometry (encoded polyline)
    let routeGeometry: [number, number][] = [];
    if (route.geometry) {
      try {
        // Decode the polyline geometry from OpenRouteService
        const decodedGeometry = decodePolyline(route.geometry);
        // Convert [lng, lat] to [lat, lng] for Leaflet
        routeGeometry = decodedGeometry.map((coord): [number, number] => [
          coord[1],
          coord[0],
        ]);
        console.log("Final route geometry points:", routeGeometry.length);
      } catch (geometryError) {
        console.warn("Could not decode route geometry:", geometryError);
        // Fallback to simple point-to-point geometry
        routeGeometry = [
          [start[0], start[1]], // Start point
          ...optimizedRoute.map(
            (wh) => [wh.latitude, wh.longitude] as [number, number]
          ),
        ];
      }
    } else {
      console.warn("No geometry returned from optimization API");
      // Fallback to simple point-to-point geometry
      routeGeometry = [
        [start[0], start[1]], // Start point
        ...optimizedRoute.map(
          (wh) => [wh.latitude, wh.longitude] as [number, number]
        ),
      ];
    }

    // If the decoded geometry coordinates are too small (likely wrong),
    // fall back to using the directions API for route geometry
    if (routeGeometry.length > 0 && routeGeometry[0][0] < 1) {
      console.warn(
        "Decoded coordinates too small, using directions API fallback"
      );
      try {
        // Build coordinates array for directions API
        const coordinates: [number, number][] = [
          [start[1], start[0]], // Start from user location [lng, lat]
          ...optimizedRoute.map((wh): [number, number] => [
            wh.longitude,
            wh.latitude,
          ]), // Add all waffle houses [lng, lat]
        ];

        const routeCoordinates = await getORSRoute(coordinates);
        // Convert [lng, lat] back to [lat, lng] for Leaflet
        routeGeometry = routeCoordinates
          .filter((coord): coord is [number, number] => coord.length >= 2)
          .map((coord): [number, number] => [coord[1], coord[0]]); // [lat, lng]

        console.log(
          "Using directions API geometry:",
          routeGeometry.length,
          "points"
        );
      } catch (directionsError) {
        console.warn("Directions API fallback failed:", directionsError);
        // Keep the original fallback geometry
      }
    }

    return {
      optimizedRoute,
      routeGeometry,
      totalDistance: route.distance / 1609.34, // Convert meters to miles
      totalDuration: route.duration / 60, // Convert seconds to minutes
    };
  } catch (error) {
    console.error("Error calling OpenRouteService Optimization API:", error);
    throw new Error(
      error instanceof Error
        ? error.message
        : "Failed to optimize route with OpenRouteService"
    );
  }
};

// Helper function to call the ORS Directions API for detailed route geometry
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

// Component for route details card
const RouteDetailsCard: React.FC<{
  route: WaffleHouse[];
  totalDistance: number;
  routeStats: { distance: number; duration: number } | null;
  isLoadingRoute: boolean;
  routeError: string | null;
}> = ({ route, totalDistance, routeStats, isLoadingRoute, routeError }) => {
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
            <span className="text-yellow-800 font-bold text-sm">🧇</span>
          </div>
          <h3 className="font-semibold text-gray-900">Waffle Route</h3>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-gray-900">
            {route.length} stops
          </div>
          <div className="text-xs text-gray-500">
            {routeStats ? (
              <>
                {routeStats.distance.toFixed(1)} mi •{" "}
                {routeStats.duration.toFixed(0)} min
              </>
            ) : (
              `${totalDistance.toFixed(1)} mi`
            )}
          </div>
        </div>
      </div>

      {isLoadingRoute && (
        <div className="text-blue-600 text-sm mb-3">🔄 Loading route...</div>
      )}

      {routeError && (
        <div className="text-orange-600 text-sm mb-3">{routeError}</div>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {route.map((waffleHouse, index) => (
          <div
            key={waffleHouse.id}
            className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg"
          >
            <div className="flex-shrink-0">
              <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                {index + 1}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-xs font-medium text-gray-500">
                  Store #{waffleHouse.store_code}
                </span>
              </div>
              <h4 className="font-medium text-gray-900 text-sm mb-1">
                {waffleHouse.business_name}
              </h4>
              <p className="text-xs text-gray-600">📍 {waffleHouse.address}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Custom Radius Slider Component
const RadiusSlider: React.FC<{
  value: number;
  onChange: (value: RadiusOption) => void;
}> = ({ value, onChange }) => {
  // Define the key radius values and their positions
  const radiusValues = [1, 25, 50];

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value) as RadiusOption;
    onChange(newValue);
  };

  const handleMarkerClick = (radiusValue: number) => {
    onChange(radiusValue as RadiusOption);
  };

  return (
    <div className="relative">
      <input
        type="range"
        min="1"
        max="50"
        step="1"
        value={value}
        onChange={handleSliderChange}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider relative z-10"
      />

      {/* Clickable markers for key values */}
      <div className="absolute top-0 left-0 right-0 h-2 pointer-events-none">
        <div className="relative h-full">
          {radiusValues.map((radiusValue) => {
            const position = ((radiusValue - 1) / 49) * 100; // Convert to percentage
            return (
              <button
                key={radiusValue}
                onClick={() => handleMarkerClick(radiusValue)}
                className={`absolute w-3 h-3 -mt-0.5 -ml-1.5 rounded-full border-2 border-white shadow-sm transition-all ${
                  value >= radiusValue
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-gray-300 hover:bg-gray-400"
                } pointer-events-auto`}
                style={{ left: `${position}%` }}
                title={`${radiusValue} mile${radiusValue === 1 ? "" : "s"}`}
              />
            );
          })}
        </div>
      </div>

      {/* Labels for key values */}
      <div className="flex justify-between text-xs text-gray-500 mt-3">
        <span>1 mi</span>
        <span>25 mi</span>
        <span>50 mi</span>
      </div>
    </div>
  );
};

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
  const [isRadiusExpanded, setIsRadiusExpanded] = useState(false);
  const [isRouteDetailsExpanded, setIsRouteDetailsExpanded] = useState(false);
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
          const {
            optimizedRoute,
            routeGeometry,
            totalDistance: calculatedDistance,
            totalDuration,
          } = await getOptimizedWaffleRoute(
            [lat, lng], // Start from user location [lat, lng]
            data.data
          );
          setRoute(optimizedRoute);
          setTotalDistance(calculatedDistance);

          // Set route statistics from optimization
          setRouteStats({
            distance: calculatedDistance,
            duration: totalDuration,
          });

          // Use the optimized route geometry if available, otherwise get detailed route
          if (routeGeometry.length > 0) {
            setRealRouteCoordinates(routeGeometry);
          } else {
            await fetchRealRoute(lat, lng, optimizedRoute);
          }
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

  // Force map resize after component mounts to fix rendering issues
  useEffect(() => {
    if (mapRef.current) {
      // Multiple attempts to ensure map renders properly
      const timers = [
        setTimeout(() => mapRef.current?.invalidateSize(), 100),
        setTimeout(() => mapRef.current?.invalidateSize(), 500),
        setTimeout(() => mapRef.current?.invalidateSize(), 1000),
      ];
      return () => timers.forEach((timer) => clearTimeout(timer));
    }
  }, []);

  // Handle window resize and orientation changes
  useEffect(() => {
    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  // Force map resize when route details expand/collapse
  useEffect(() => {
    if (mapRef.current) {
      const timer = setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isRouteDetailsExpanded]);

  const currentCenter: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : BILOXI_COORDS;

  return (
    <div className="h-screen flex flex-col">
      {/* Google Maps-style Header - Fixed on Mobile */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-3 flex-shrink-0 z-40">
        <div className="max-w-4xl mx-auto">
          {/* Mobile: Single row layout */}
          <div className="flex items-center space-x-2 md:space-x-3">
            {/* Search Input */}
            <div className="flex-1 relative min-w-0">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter location"
                className="w-full px-2 py-2 pl-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                onKeyPress={(e) => e.key === "Enter" && searchLocation()}
              />
              <div className="absolute left-2 top-1/2 transform -translate-y-1/2">
                <svg
                  className="w-3 h-3 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {/* Location Button */}
            <button
              onClick={getCurrentLocation}
              disabled={isLoading}
              className="flex-shrink-0 w-8 h-8 px-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center"
              title="Use my location"
            >
              {isLoading ? (
                <svg
                  className="w-3 h-3 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : (
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              )}
            </button>

            {/* Search Button */}
            <button
              onClick={searchLocation}
              disabled={isLoading || !searchQuery.trim()}
              className="flex-shrink-0 w-8 h-8 px-1 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors flex items-center justify-center"
              title="Search"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>

            {/* Radius Toggle */}
            <button
              onClick={() => setIsRadiusExpanded(!isRadiusExpanded)}
              className="flex-shrink-0 w-8 h-8 px-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center"
              title="Radius settings"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>

          {/* Radius Slider - Collapsible */}
          {isRadiusExpanded && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Search Radius: {selectedRadius} mile
                  {selectedRadius === 1 ? "" : "s"}
                </label>
              </div>
              <RadiusSlider
                value={selectedRadius}
                onChange={setSelectedRadius}
              />
            </div>
          )}

          {/* Status Messages */}
          {error && (
            <div className="mt-3 text-red-600 text-sm bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          {isLoadingWaffleHouses && (
            <div className="mt-3 text-blue-600 text-sm">
              Loading Waffle Houses...
            </div>
          )}

          {waffleHouseError && (
            <div className="mt-3 text-red-600 text-sm">{waffleHouseError}</div>
          )}

          {waffleHouses.length > 0 && !isLoadingWaffleHouses && (
            <div className="mt-3 text-green-600 text-sm">
              Found {waffleHouses.length} Waffle House
              {waffleHouses.length === 1 ? "" : "s"}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Map Container */}
        <div className="flex-1 relative min-h-0">
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
                    <div className="min-w-[200px]">
                      <h3 className="font-semibold text-sm">
                        {userLocation.name}
                      </h3>
                      <p className="text-xs text-gray-600">
                        {userLocation.lat.toFixed(6)},{" "}
                        {userLocation.lng.toFixed(6)}
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
                    <div className="min-w-[200px]">
                      <h3 className="font-semibold text-sm">
                        {selectedRadius}-Mile Radius
                      </h3>
                      <p className="text-xs text-gray-600">
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
              const routeIndex = route.findIndex(
                (wh) => wh.id === waffleHouse.id
              );
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
                    <div className="min-w-[250px] max-w-[300px]">
                      <h3 className="font-semibold text-sm md:text-base">
                        {waffleHouse.business_name}
                      </h3>
                      <p className="text-xs md:text-sm text-gray-600 mb-2">
                        Store #{waffleHouse.store_code}
                      </p>
                      {isInRoute && (
                        <p className="text-xs md:text-sm font-medium text-blue-600 mb-1">
                          🍳 Stop #{routeIndex + 1} on route
                        </p>
                      )}
                      <p className="text-xs md:text-sm">
                        {waffleHouse.address}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 hidden md:block">
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
                      <div className="min-w-[280px] max-w-[350px]">
                        <h3 className="font-semibold text-sm md:text-base">
                          🍳 Optimized TSP Route
                        </h3>
                        <p className="text-xs md:text-sm text-gray-600 mb-2">
                          Optimized route visiting all {route.length} Waffle
                          Houses using OpenRouteService
                        </p>
                        {routeStats && (
                          <>
                            <p className="text-xs md:text-sm font-medium">
                              Road Distance: {routeStats.distance.toFixed(1)}{" "}
                              miles
                            </p>
                            <p className="text-xs md:text-sm font-medium">
                              Estimated Time: {routeStats.duration.toFixed(0)}{" "}
                              minutes
                            </p>
                          </>
                        )}
                        <div className="text-xs text-gray-500 mt-2">
                          <p>Route order:</p>
                          <ol className="list-decimal list-inside mt-1 max-h-32 overflow-y-auto">
                            {route.map((wh, index) => (
                              <li key={wh.id} className="truncate text-xs">
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
                      <div className="min-w-[280px] max-w-[350px]">
                        <h3 className="font-semibold text-sm md:text-base">
                          🍳 Fallback Route
                        </h3>
                        <p className="text-xs md:text-sm text-gray-600 mb-2">
                          Direct route visiting all {route.length} Waffle Houses
                          (optimization failed)
                        </p>
                        <p className="text-xs md:text-sm font-medium">
                          Total Distance: {totalDistance.toFixed(1)} miles
                        </p>
                        {routeError && (
                          <p className="text-xs text-orange-600 mt-1">
                            {routeError}
                          </p>
                        )}
                        <div className="text-xs text-gray-500 mt-2">
                          <p>Route order:</p>
                          <ol className="list-decimal list-inside mt-1 max-h-32 overflow-y-auto">
                            {route.map((wh, index) => (
                              <li key={wh.id} className="truncate text-xs">
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

        {/* Route Details Sidebar/Bottom Sheet */}
        {route.length > 0 && (
          <>
            {/* Desktop Sidebar */}
            <div className="hidden lg:block w-80 bg-white border-l border-gray-200 overflow-y-auto">
              <div className="p-4">
                <RouteDetailsCard
                  route={route}
                  totalDistance={totalDistance}
                  routeStats={routeStats}
                  isLoadingRoute={isLoadingRoute}
                  routeError={routeError}
                />
              </div>
            </div>

            {/* Mobile Bottom Route Info */}
            {route.length > 0 && (
              <div className="lg:hidden flex-shrink-0">
                <div className="bg-white border-t border-gray-200 shadow-lg">
                  {/* Route Summary Bar */}
                  <div className="flex items-center justify-between p-3 border-b border-gray-100">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
                        <span className="text-yellow-800 font-bold text-xs">
                          🧇
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {route.length} Waffle House
                          {route.length === 1 ? "" : "s"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {routeStats ? (
                            <>
                              {routeStats.distance.toFixed(1)} mi •{" "}
                              {routeStats.duration.toFixed(0)} min
                            </>
                          ) : (
                            `${totalDistance.toFixed(1)} mi total`
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setIsRouteDetailsExpanded(!isRouteDetailsExpanded)
                      }
                      className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      <svg
                        className={`w-4 h-4 transform transition-transform ${
                          isRouteDetailsExpanded ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Expandable Route Details */}
                  {isRouteDetailsExpanded && (
                    <div className="max-h-64 overflow-y-auto">
                      <div className="p-3">
                        <RouteDetailsCard
                          route={route}
                          totalDistance={totalDistance}
                          routeStats={routeStats}
                          isLoadingRoute={isLoadingRoute}
                          routeError={routeError}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WaffleMap;
