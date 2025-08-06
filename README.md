# Hungry for Waffles 🍳

A React application that solves the "Hungry for Waffles Problem" - finding the optimal route to visit multiple Waffle House locations using real road routes via OpenRouteService.

## Features

- 🗺️ Interactive map with Leaflet and React-Leaflet
- 📍 User location detection with geolocation API
- 🔍 Location search functionality using OpenStreetMap Nominatim
- 🍳 Waffle House location finder with radius-based search
- 🛣️ Real road routing with OpenRouteService
- 📊 Route statistics (distance, duration)
- 🎯 TSP (Traveling Salesman Problem) optimization using OpenRouteService Optimization API
- 📱 Responsive design with mobile-first approach
- 🎛️ Adjustable search radius (1-50 miles)
- 🗃️ PostgreSQL database with PostGIS for spatial queries
- 🚀 Vercel deployment ready

## Setup

### Prerequisites

- Node.js (v20.19.0 or higher)
- npm or yarn
- PostgreSQL database with PostGIS extension
- OpenRouteService API key

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```
# OpenRouteService API Key (required for routing)
VITE_OPENROUTE_API_KEY=your_openroute_api_key_here

# Database connection (required for Waffle House data)
DATABASE_URL=your_postgresql_connection_string_here
```

### OpenRouteService API Key

To enable real road routing and TSP optimization, you need an OpenRouteService API key:

1. Sign up for a free API key at: https://openrouteservice.org/dev/#/signup
2. Add your API key to the `.env` file as shown above

### Database Setup

The application requires a PostgreSQL database with PostGIS extension and a `waffle_houses` table. The table should have the following structure:

```sql
CREATE TABLE waffle_houses (
  id SERIAL PRIMARY KEY,
  store_code VARCHAR(50),
  business_name VARCHAR(255),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  address TEXT,
  geom GEOMETRY(POINT, 4326)
);
```

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## How it Works

1. **Location Detection**: Gets the user's current location via browser geolocation or allows manual search
2. **Waffle House Discovery**: Queries PostgreSQL database with PostGIS to find nearby Waffle House locations within a specified radius
3. **Route Optimization**: Uses OpenRouteService's Optimization API to solve the TSP and find the optimal route visiting all Waffle Houses
4. **Real Road Routing**: Integrates with OpenRouteService Directions API to get actual driving routes with turn-by-turn navigation
5. **Visualization**: Displays the optimized route on an interactive map with detailed statistics

## API Integration

- **Custom Waffle House API**: Serverless function that queries PostgreSQL database with PostGIS spatial queries
- **OpenRouteService Optimization API**: For solving the Traveling Salesman Problem
- **OpenRouteService Directions API**: For real road routing and navigation
- **OpenStreetMap Nominatim**: For location search and geocoding

## Technologies Used

- **Frontend**: React 19.1.0, TypeScript 5.8.3, Vite 7.0.4
- **Mapping**: Leaflet 1.9.4, React-Leaflet 5.0.0
- **Styling**: Tailwind CSS 3.4.17
- **HTTP Client**: Axios 1.11.0
- **Database**: PostgreSQL with PostGIS, Neon Database serverless driver
- **Deployment**: Vercel
- **APIs**: OpenRouteService, OpenStreetMap Nominatim

## Project Structure

```
hungry-for-waffles/
├── api/                    # Serverless API functions
│   └── waffle_houses.js   # Waffle House location API
├── src/
│   ├── App.tsx            # Main application component
│   ├── WaffleMap.tsx      # Interactive map component
│   ├── utils/
│   │   └── units.ts       # Unit conversion utilities
│   └── ...
├── public/                # Static assets
└── ...
```

## Features in Detail

### Interactive Map

- Built with Leaflet and React-Leaflet
- Shows user location with custom marker
- Displays Waffle House locations with numbered route stops
- Visualizes search radius with interactive circle
- Shows optimized route with real road geometry

### Route Optimization

- Implements Traveling Salesman Problem (TSP) solver
- Uses OpenRouteService Optimization API for optimal route calculation
- Provides both optimized route order and real road geometry
- Calculates accurate distance and duration estimates

### Search Functionality

- Adjustable search radius from 1 to 50 miles
- Location search using OpenStreetMap Nominatim
- Current location detection with fallback to default location
- Real-time search results with loading states

### Responsive Design

- Mobile-first design approach
- Collapsible route details panel
- Touch-friendly interface
- Optimized for both desktop and mobile devices

## Deployment

The application is configured for deployment on Vercel with:

- Serverless API functions for database queries
- Environment variable configuration
- Optimized build process with Vite
- Automatic HTTPS and CDN distribution

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default tseslint.config([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```
