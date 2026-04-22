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
// MAIN FLOW
// ------------------------------

async function onClick() {
    log("Starting extraction...");

    const chromeAPI = window.chrome || window.browser;

    const { classId } = await getClassId(chromeAPI);

    const { blobUrl, participants, raw } = await fetchClassBlobUrl(classId);

    // NEW: class-storage blob
    const classStorage = await fetchClassStorage(blobUrl);

    console.log("Class storage:", classStorage);

    const mapData = await fetchMapInfo(blobUrl);

    const controls = mapData?.controls || [];
    const map = mapData?.map;

    console.log("Map data:", map);

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
        sessionId: p.sessionId,
        sessionTimeInterval: p.sessionTimeInterval
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

    const downloadType = document.querySelector('input[name="downloadType"]:checked').value;

    if (downloadType === 'json') {
        log("Download ready");
        downloadJSON(chromeAPI, output, "livelox_extracted.json");
    } else if (downloadType === 'png') {
        try {
            log("Downloading map PNG...");
            await downloadPNG(chromeAPI, map, "livelox_map.png");
            log("Map PNG downloaded");
        } catch (e) {
            log(`PNG download failed: ${e.message}`);
        }
    } else if (downloadType === 'zip') {
        try {
            log("Creating ZIP...");
            await downloadZIP(chromeAPI, output, "livelox_data.zip");
            log("ZIP downloaded");
        } catch (e) {
            log(`ZIP creation failed: ${e.message}`);
        }
    } else if (downloadType === 'iofxml') {
        try {
            log("Generating IOF XML...");
            await downloadIOFXML(chromeAPI, output, "livelox_data.xml");
            log("IOF XML downloaded");
        } catch (e) {
            log(`IOF XML generation failed: ${e.message}`);
        }
    } else if (downloadType === 'routes') {
        try {
            log("Generating routes...");
            await downloadRoutes(chromeAPI, output, "livelox_routes.txt");
            log("Routes downloaded");
        } catch (e) {
            log(`Routes generation failed: ${e.message}`);
        }
    }


    log("Done");
}

// ------------------------------
// BOOT
// ------------------------------

document.addEventListener("DOMContentLoaded", initializePopup);