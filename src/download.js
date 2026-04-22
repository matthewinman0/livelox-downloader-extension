// ------------------------------
// DOWNLOAD
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
    if (!imageUrl) {
        throw new Error("No image URL found in map data");
    }

    const res = await fetch(imageUrl);
    const blob = await res.blob();

    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
        url,
        filename,
        conflictAction: "uniquify"
    });
}

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
    const className = "Class";
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

function getIntervalSeconds(interval) {
    const start = Date.parse(interval.start);
    const end = Date.parse(interval.end);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "ERORR";
    else
        return Math.floor((end - start) / 1000);
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