# Hungry for Waffles 🍳

A React application that solves the "Hungry for Waffles Problem" - finding the optimal route to visit multiple Waffle House locations using real road routes via OpenRouteService.

## Features

- 🗺️ Interactive map with Leaflet
- 📍 User location detection
- 🔍 Location search functionality
- 🍳 Waffle House location finder
- 🛣️ Real road routing with OpenRouteService
- 📊 Route statistics (distance, duration)
- 🎯 Greedy nearest-neighbor algorithm for route optimization

## Setup

### Prerequisites

- Node.js (v20.19.0 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### OpenRouteService API Key

To enable real road routing, you need an OpenRouteService API key:

1. Sign up for a free API key at: https://openrouteservice.org/dev/#/signup
2. Create a `.env` file in the root directory
3. Add your API key:
   ```
   VITE_OPENROUTE_API_KEY=your_openroute_api_key_here
   ```

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## How it Works

1. **Location Detection**: Gets the user's current location or allows manual search
2. **Waffle House Discovery**: Finds nearby Waffle House locations within a specified radius
3. **Route Optimization**: Uses a greedy nearest-neighbor algorithm to find an efficient route
4. **Real Road Routing**: Integrates with OpenRouteService to get actual driving routes
5. **Visualization**: Displays the route on an interactive map with statistics

## API Integration

- **Waffle House API**: Custom API endpoint for finding nearby locations
- **OpenRouteService**: For real road routing and navigation
- **OpenStreetMap Nominatim**: For location search and geocoding

## Technologies Used

- React 19
- TypeScript
- Vite
- Leaflet (React-Leaflet)
- Tailwind CSS
- Axios
- OpenRouteService API

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
