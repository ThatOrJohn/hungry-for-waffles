import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const sql = neon('postgresql://neondb_owner:npg_XLkiw5qHShR7@ep-blue-credit-aesgjhbz-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');

interface WaffleHouse {
  id: number;
  store_code: string;
  business_name: string;
  latitude: number;
  longitude: number;
  address: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse and validate query parameters
    const { lat, lng, radius = '10' } = req.query;

    // Check if required parameters are present
    if (!lat || !lng) {
      return res.status(400).json({ 
        error: 'Missing required parameters: lat and lng are required' 
      });
    }

    // Convert to numbers and validate
    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lng as string);
    const radiusMiles = parseFloat(radius as string);

    // Validate latitude and longitude
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ 
        error: 'Invalid lat or lng parameters. Must be valid numbers.' 
      });
    }

    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({ 
        error: 'Latitude must be between -90 and 90 degrees' 
      });
    }

    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({ 
        error: 'Longitude must be between -180 and 180 degrees' 
      });
    }

    // Validate radius
    if (isNaN(radiusMiles) || radiusMiles <= 0) {
      return res.status(400).json({ 
        error: 'Radius must be a positive number' 
      });
    }

    // Convert radius from miles to meters (1 mile = 1609.34 meters)
    const radiusMeters = radiusMiles * 1609.34;

    // Query the database using PostGIS
    const waffleHouses: WaffleHouse[] = await sql`
      SELECT id, store_code, business_name, latitude, longitude, address
      FROM waffle_houses
      WHERE ST_DWithin(
        geom::geography,
        ST_MakePoint(${longitude}, ${latitude})::geography,
        ${radiusMeters}
      )
      ORDER BY ST_Distance(
        geom::geography,
        ST_MakePoint(${longitude}, ${latitude})::geography
      )
    `;

    // Return the results
    return res.status(200).json({
      success: true,
      data: waffleHouses,
      count: waffleHouses.length,
      query: {
        latitude,
        longitude,
        radius: radiusMiles,
        radiusMeters
      }
    });

  } catch (error) {
    console.error('Error querying waffle houses:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 