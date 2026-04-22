
// ------------------------------
// DOWNLOAD HELPERS
// ------------------------------

function downloadJSON(chrome, data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json"
    });

    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
        url,
        filename,
        conflictAction: "uniquify"
    });
}

async function downloadPNG(chrome, map, filename) {
    const imageUrl = map?.imageUrl || map?.image || map?.url;
    if (!imageUrl) throw new Error("No image URL found in map data");

    const res = await fetch(imageUrl);
    const blob = await res.blob();

    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
        url,
        filename,
        conflictAction: "uniquify"
    });
}

// ------------------------------
// ZIP EXPORT
// ------------------------------

async function downloadZIP(chrome, data, filename) {
    const zip = new JSZip();

    // Add JSON
    zip.file("raw.json", JSON.stringify(data, null, 2));

    // Add PNG if available
    const imageUrl = data.map?.imageUrl || data.map?.image || data.map?.url;
    if (imageUrl) {
        try {
            const res = await fetch(imageUrl);
            const blob = await res.blob();
            zip.file("map.png", blob);
        } catch (e) {
            console.error("Failed to add map.png to zip:", e);
        }
    }

    // Add routes as separate files
    data.routes.forEach((route, index) => {
        zip.file(`route_${index}_${route.name}.json`, JSON.stringify(route, null, 2));
    });

    // Add IOF XML
    zip.file("results.xml", generateIOFXML(data));

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);

    chrome.downloads.download({
        url,
        filename,
        conflictAction: "uniquify"
    });
}

async function downloadIOFXML(chrome, data, filename) {
    const xml = generateIOFXML(data);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
        url,
        filename,
        conflictAction: "uniquify"
    });
}

function generateIOFXML(data) {
    const eventName = data.event || "Livelox Event";
    const className = data.classStorage?.courses?.[0]?.name || "Class";
    const createTime = new Date().toISOString();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<ResultList xmlns="http://www.orienteering.org/datastandard/3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.orienteering.org/datastandard/3.0 http://www.orienteering.org/resources/dtd/ResultList.xsd" iofVersion="3.0" createTime="${createTime}" creator="Livelox Downloader" status="Complete">
  <Event>
    <Name>${escapeXml(eventName)}</Name>
  </Event>
  <ClassResult>
    <Class>
      <Name>${escapeXml(className)}</Name>
    </Class>`;

    data.participants.forEach((p, index) => {
        console.log("Participant:", p);
        const route = data.routes.find(r => String(r.id) === String(p.id));
        const interval = p.sessionTimeInterval || route?.sessionTimeInterval || {};
        const startTime = interval.start || "";
        const finishTime = interval.end || "";
        const time = getIntervalSeconds(interval);
        const status = route ? "DidNotStart" : "OK";
        const [given, ...familyParts] = (p.name || "").split(" ");
        const family = familyParts.join(" ");

        xml += `
    <PersonResult>
      <Person>
        <Id>${escapeXml(String(p.id || ""))}</Id>
        <Name>
          <Family>${escapeXml(family)}</Family>
          <Given>${escapeXml(given || "")}</Given>
        </Name>
      </Person>
      <Result>`;

        if (startTime) {
            xml += `
        <StartTime>${escapeXml(startTime)}</StartTime>`;
        }

        if (finishTime) {
            xml += `
        <FinishTime>${escapeXml(finishTime)}</FinishTime>`;
        }

        xml += `
        <Time>${escapeXml(String(time))}</Time>
        <Status>${escapeXml(status)}</Status>
        
      </Result>
    </PersonResult>`;
    });

    xml += `
  </ClassResult>
</ResultList>`;

    return xml;
}


function downloadRoutes(chrome, json, filename = "livelox_routes.txt") {
    const routes = findRoutesAnywhere(json);

    if (!routes.length) {
        throw new Error("No routes found");
    }

    const output = routes.join("\n\n"); // separate each route

    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
        url,
        filename,
        conflictAction: "uniquify"
    });
}

// ------------------------------
// UTILS
// ------------------------------

function getIntervalSeconds(interval) {
    const start = Date.parse(interval?.start);
    const end = Date.parse(interval?.end);
    if (!start || !end || end < start) return 0;
    return Math.floor((end - start) / 1000);
}

function findRoutesAnywhere(obj, results = []) {
    if (!obj) return results;

    // If it's a string, check if it looks like a route blob
    if (typeof obj === "string") {
        // IOF route blobs are usually long base64 strings
        if (obj.length > 100 && /^[A-Za-z0-9+/=]+$/.test(obj)) {
            results.push(obj);
        }
        return results;
    }

    // Arrays → scan each item
    if (Array.isArray(obj)) {
        for (const item of obj) {
            findRoutesAnywhere(item, results);
        }
        return results;
    }

    // Objects → scan all values
    if (typeof obj === "object") {
        for (const key in obj) {
            findRoutesAnywhere(obj[key], results);
        }
    }

    return results;
}

function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case "'": return '&#39;';
            case '"': return '&quot;';
        }
    });
}