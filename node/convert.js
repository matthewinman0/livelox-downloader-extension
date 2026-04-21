import fs from "fs";

// -----------------------------
// LOAD INPUT
// -----------------------------

const inputPath = process.argv[2] || "input.json";

if (!fs.existsSync(inputPath)) {
    console.error("Missing input.json");
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

// -----------------------------
// ROUTE NORMALISATION
// -----------------------------

function normalizeRoute(route) {
    if (!route) return [];

    if (Array.isArray(route.points)) {
        return route.points;
    }

    if (Array.isArray(route)) {
        return route;
    }

    return [];
}

// -----------------------------
// GEOJSON EXPORT
// -----------------------------

function toGeoJSON(routes) {
    return {
        type: "FeatureCollection",
        features: routes.map(r => ({
            type: "Feature",
            properties: {
                id: r.id,
                name: r.name,
                sessionId: r.sessionId
            },
            geometry: {
                type: "LineString",
                coordinates: normalizeRoute(r.route).map(p => [
                    p.lon ?? p.longitude,
                    p.lat ?? p.latitude
                ]).filter(c => c[0] && c[1])
            }
        }))
    };
}

// -----------------------------
// GPX EXPORT
// -----------------------------

function toGPX(routes) {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<gpx version="1.1" creator="livelox-tool" xmlns="http://www.topografix.com/GPX/1/1">\n`;

    for (const r of routes) {
        const points = normalizeRoute(r.route);

        xml += `  <trk>\n`;
        xml += `    <name>${r.name ?? "Unknown"}</name>\n`;
        xml += `    <trkseg>\n`;

        for (const p of points) {
            // handle ALL common formats
            const lat =
                p.lat ??
                p.latitude ??
                p.position?.lat ??
                p.position?.latitude;

            const lon =
                p.lon ??
                p.longitude ??
                p.position?.lon ??
                p.position?.longitude;

            if (typeof lat !== "number" || typeof lon !== "number") continue;

            xml += `      <trkpt lat="${lat}" lon="${lon}"></trkpt>\n`;
        }

        xml += `    </trkseg>\n`;
        xml += `  </trk>\n`;
    }

    xml += `</gpx>`;
    return xml;
}

// -----------------------------
// OUTPUT ROUTES
// -----------------------------

const routes = data.routes || [];

// -----------------------------
// WRITE OUTPUTS
// -----------------------------

fs.mkdirSync("output", { recursive: true });

fs.writeFileSync(
    "output/routes.geojson",
    JSON.stringify(toGeoJSON(routes), null, 2)
);

fs.writeFileSync(
    "output/routes.gpx",
    toGPX(routes)
);

fs.writeFileSync(
    "output/participants.json",
    JSON.stringify(data.participants, null, 2)
);

fs.writeFileSync(
    "output/map.json",
    JSON.stringify(data.map, null, 2)
);

console.log("Conversion complete → /output");