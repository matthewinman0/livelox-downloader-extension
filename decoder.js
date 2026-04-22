const fs = require("fs");

// ===============================
// SAFE BUFFER READERS
// ===============================
function canRead(buffer, offset, size) {
    return Number.isFinite(offset) &&
        offset >= 0 &&
        offset + size <= buffer.length;
}

function readUInt(buffer, offset, size) {
    if (!canRead(buffer, offset, size)) return null;
    return {
        value: buffer.readUIntBE(offset, size),
        offset: offset + size
    };
}

function readInt(buffer, offset, size) {
    if (!canRead(buffer, offset, size)) return null;
    return {
        value: buffer.readIntBE(offset, size),
        offset: offset + size
    };
}

function readByte(buffer, offset) {
    if (!canRead(buffer, offset, 1)) return null;
    return {
        value: buffer.readUInt8(offset),
        offset: offset + 1
    };
}

// ===============================
// VALIDATION
// ===============================
function isValidTime(t) {
    if (!Number.isFinite(t)) return false;
    const year = new Date(t).getUTCFullYear();
    return year >= 1990 && year <= 2100;
}

// ===============================
// STATE
// ===============================
class DecodeState {
    constructor() {
        this.valid = false;
        this.time = 0;
        this.x = 0;
        this.y = 0;
        this.alt = 0;
    }

    reset(wp) {
        this.valid = true;
        this.time = wp.time;
        this.x = wp.xRaw;
        this.y = wp.yRaw;
        this.alt = wp.altRaw || 0;
    }
}

// ===============================
// ROUTE
// ===============================
class IofXml30Route {
    constructor(waypoints = []) {
        this.waypoints = waypoints;
    }

    static fromBuffer(buffer) {
        let offset = 0;
        const waypoints = [];
        const state = new DecodeState();

        let safety = 0;

        while (offset < buffer.length) {
            if (++safety > buffer.length * 2) break;

            const prev = state.valid ? state : null;
            const result = IofXml30Waypoint.fromBuffer(buffer, offset, prev);

            if (!result || result.offset <= offset) {
                offset++;
                continue;
            }

            const wp = result.waypoint;

            if (!isValidTime(wp.time)) {
                offset++;
                continue;
            }

            waypoints.push(wp);
            offset = result.offset;
            state.reset(wp);
        }

        return new IofXml30Route(waypoints);
    }

    get startTime() {
        return this.waypoints[0]?.time || 0;
    }

    get endTime() {
        return this.waypoints.at(-1)?.time || 0;
    }

    get duration() {
        return this.endTime - this.startTime;
    }

    get length() {
        let sum = 0;
        for (let i = 1; i < this.waypoints.length; i++) {
            sum += distance2D(this.waypoints[i - 1], this.waypoints[i]);
        }
        return sum;
    }
}

// ===============================
// WAYPOINT (XY VERSION)
// ===============================
class IofXml30Waypoint {
    constructor() {
        this.type = 0;
        this.time = 0;

        this.x = 0;
        this.y = 0;
        this.altitude = null;

        this.xRaw = 0;
        this.yRaw = 0;
        this.altRaw = 0;
    }

    static fromBuffer(buffer, offset, prev) {
        const h = readByte(buffer, offset);
        if (!h) return null;

        const header = h.value;
        offset = h.offset;

        const wp = new IofXml30Waypoint();

        wp.type = (header & 0x80) ? 1 : 0;

        const isMs = header & 0x40;
        const isSec = header & 0x20;
        const bigDelta = header & 0x10;
        const smallDelta = header & 0x08;
        const altPresent = header & 0x04;

        const hasPrev = prev && prev.valid;

        // TIME
        if (!isMs && !isSec) {
            const r = readUInt(buffer, offset, 6);
            if (!r) return null;
            wp.time = r.value;
            offset = r.offset;
        } else if (isMs && hasPrev) {
            const r = readUInt(buffer, offset, 2);
            if (!r) return null;
            wp.time = prev.time + r.value;
            offset = r.offset;
        } else if (isSec && hasPrev) {
            const r = readByte(buffer, offset);
            if (!r) return null;
            wp.time = prev.time + r.value * 1000;
            offset = r.offset;
        } else {
            const r = readUInt(buffer, offset, 6);
            if (!r) return null;
            wp.time = r.value;
            offset = r.offset;
        }

        let xRaw, yRaw, altRaw;

        if (!hasPrev || (!bigDelta && !smallDelta)) {
            const x = readInt(buffer, offset, 4);
            const y = readInt(buffer, x.offset, 4);
            if (!x || !y) return null;

            xRaw = x.value;
            yRaw = y.value;
            offset = y.offset;

            if (altPresent) {
                const a = readInt(buffer, offset, 3);
                if (!a) return null;
                altRaw = a.value;
                offset = a.offset;
            }
        }

        else if (bigDelta) {
            const x = readInt(buffer, offset, 2);
            const y = readInt(buffer, x.offset, 2);
            if (!x || !y) return null;

            xRaw = prev.x + x.value;
            yRaw = prev.y + y.value;
            offset = y.offset;
        }

        else {
            const x = readByte(buffer, offset);
            const y = readByte(buffer, x.offset);
            if (!x || !y) return null;

            xRaw = prev.x + (x.value << 24 >> 24);
            yRaw = prev.y + (y.value << 24 >> 24);
            offset = y.offset;
        }

        wp.xRaw = xRaw;
        wp.yRaw = yRaw;
        wp.altRaw = altRaw;

        // IMPORTANT: no lat/lon conversion
        wp.x = xRaw;
        wp.y = yRaw;

        return { waypoint: wp, offset };
    }
}

// ===============================
// TRUE DISTANCE (2D)
// ===============================
function distance2D(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// ===============================
// CLI
// ===============================
function prompt(q) {
    const buf = Buffer.alloc(1024);
    fs.writeSync(1, q);
    const bytes = fs.readSync(0, buf, 0, 1024);
    return buf.toString("utf8", 0, bytes).trim();
}

function main() {
    console.log("IOF Route Decoder (XY CORRECT)");
    console.log("--------------------------------");

    console.log("1) Base64");
    console.log("2) File");

    const opt = prompt("Select: ");

    let buffer;

    if (opt === "1") {
        buffer = Buffer.from(prompt("Base64: "), "base64");
    } else {
        buffer = fs.readFileSync(prompt("File: "));
    }

    const route = IofXml30Route.fromBuffer(buffer);

    console.log("\n--- RESULT ---");
    console.log("Waypoints:", route.waypoints.length);
    console.log("Duration:", route.duration);
    console.log("Length:", route.length.toFixed(2), "map units");

    console.log("\nWaypoints:");
    for (const wp of route.waypoints) {
        console.log(
            `${new Date(wp.time).toISOString()} | ` +
            `${wp.x.toFixed(3)}, ${wp.y.toFixed(3)} | type=${wp.type}`
        );
    }
}

main();