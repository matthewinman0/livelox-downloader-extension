// ------------------------------
// LOGGING
// ------------------------------

function log(message) {
    const logElement = document.getElementById("log");

    if (logElement) {
        logElement.textContent = message;
    }

    console.log(message);
}

// ------------------------------
// NAME HANDLING
// ------------------------------

function getName(p) {
    if (p?.person?.firstName || p?.person?.lastName) {
        return `${p.person.firstName ?? ""} ${p.person.lastName ?? ""}`.trim();
    }

    if (p?.firstName || p?.lastName) {
        return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
    }

    if (p?.name && !p.name.includes("undefined")) {
        return p.name;
    }

    return "Unknown";
}

// ------------------------------
// POPUP INIT
// ------------------------------

function initializePopup() {
    const downloadBtn = document.getElementById("mapDownload");

    if (!downloadBtn) {
        console.error("mapDownload button not found");
        return;
    }

    downloadBtn.addEventListener("click", () => {
        onClick().catch(err => {
            log(`Error: ${err?.message || err}`);
        });
    });
}

// ------------------------------
// CHROME TAB HANDLING
// ------------------------------

function getClassId(chrome) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs?.[0]?.url) {
                reject(new Error("No active tab found"));
                return;
            }

            try {
                const url = new URL(tabs[0].url);
                const classId = url.searchParams.get("classId");

                if (!classId) {
                    reject(new Error("Not a valid Livelox class page"));
                    return;
                }

                resolve({
                    tabId: tabs[0].id,
                    classId
                });
            } catch {
                reject(new Error("Invalid URL"));
            }
        });
    });
}

// ------------------------------
// API FETCH (ClassInfo)
// ------------------------------

async function fetchClassBlobUrl(classId) {
    const res = await fetch("https://www.livelox.com/Data/ClassInfo", {
        method: "POST",
        headers: {
            "accept": "application/json",
            "content-type": "application/json",
            "x-requested-with": "XMLHttpRequest"
        },
        body: JSON.stringify({
            eventId: null,
            courseIds: [],
            relayLegs: [],
            relayLegGroupIds: [],
            classIds: [parseInt(classId)]
        })
    });

    const data = await res.json();

    return {
        blobUrl: data?.general?.classBlobUrl,
        participants: data?.general?.participantMetadatas || [],
        raw: data
    };
}

// ------------------------------
// NEW: CLASS STORAGE FETCH
// ------------------------------

async function fetchClassStorage(blobUrl) {
    if (!blobUrl) return null;

    try {
        const res = await fetch(blobUrl);

        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // Try JSON first
        try {
            const text = new TextDecoder("utf-8").decode(bytes);
            return JSON.parse(text);
        } catch {}

        // Try gzip
        try {
            const stream = new Blob([bytes]).stream()
                .pipeThrough(new DecompressionStream("gzip"));

            const text = await new Response(stream).text();
            return JSON.parse(text);
        } catch {}

        // fallback raw
        return {
            raw: Array.from(bytes),
            note: "Unknown format"
        };

    } catch (e) {
        return { error: e.message };
    }
}

// ------------------------------
// MAP FETCH
// ------------------------------

async function fetchMapInfo(blobUrl) {
    const res = await fetch(blobUrl);
    return await res.json();
}

// ------------------------------
// ROUTE DECODING
// ------------------------------

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

async function tryDecompressGzip(bytes) {
    try {
        const stream = new Blob([bytes]).stream()
            .pipeThrough(new DecompressionStream("gzip"));

        const response = new Response(stream);
        return await response.text();
    } catch {
        return null;
    }
}

async function decodeRouteData(routeData) {
    if (!routeData) return null;

    try {
        const bytes = base64ToBytes(routeData);
        const decompressed = await tryDecompressGzip(bytes);

        if (decompressed) {
            try {
                return JSON.parse(decompressed);
            } catch {
                return decompressed;
            }
        }

        return { raw: routeData, note: "Could not decompress" };

    } catch (e) {
        return { raw: routeData, error: e.message };
    }
}

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

// ------------------------------
// MAIN FLOW
// ------------------------------

async function onClick() {
    log("Starting extraction...");

    const chromeAPI = window.chrome || window.browser;

    const { classId } = await getClassId(chromeAPI);

    const { blobUrl, participants, raw } = await fetchClassBlobUrl(classId);

    // NEW: class-storage blob
    const classStorage = await fetchClassStorage(blobUrl);

    const mapData = await fetchMapInfo(blobUrl);

    const controls = mapData?.controls || [];
    const map = mapData?.map;

    log(`Found ${participants.length} participants`);

    const routes = [];

    for (const p of participants) {
        if (!p.routeData) continue;

        const decoded = await decodeRouteData(p.routeData);

        routes.push({
            id: p.id,
            name: getName(p),
            sessionId: p.sessionId,
            route: decoded
        });
    }

    // OPTIONAL: attempt enrichment if classStorage contains matching participants
    const enhancedParticipants = (classStorage?.participants || participants).map(p => ({
        id: p.id,
        name: getName(p),
        sessionId: p.sessionId
    }));

    const output = {
        event: raw?.general?.event?.name,
        map,
        controls,

        // original
        participants: enhancedParticipants,

        // raw + extra dataset
        classStorage,

        routes
    };

    log("Download ready");

    downloadJSON(chromeAPI, output, "livelox_extracted.json");

    log("Done");
}

// ------------------------------
// BOOT
// ------------------------------

document.addEventListener("DOMContentLoaded", initializePopup);