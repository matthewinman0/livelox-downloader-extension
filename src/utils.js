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