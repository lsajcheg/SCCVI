
const crypto = require("node:crypto");

// Generar PIN aleatorio de seis dígitos
function generarPIN() {
    return String(
        crypto.randomInt(0, 1000000)
    ).padStart(6, "0");
}

// Generar identificador único del QR
function generarTokenQR() {
    return crypto.randomUUID();
}

// Proteger el PIN antes de guardarlo
function crearHashPIN(pin) {
    const salt = crypto.randomBytes(16);

    const hash = crypto.scryptSync(
        pin,
        salt,
        64
    );

    return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

// Verificar un PIN contra el hash almacenado
function verificarPIN(pin, valorGuardado) {
    if (!/^\d{6}$/.test(pin || "")) {
        return false;
    }

    if (typeof valorGuardado !== "string") {
        return false;
    }

    const partes = valorGuardado.split(":");

    if (partes.length !== 2) {
        return false;
    }

    const [saltHex, hashHex] = partes;

    if (!/^[0-9a-f]{32}$/.test(saltHex) ||
        !/^[0-9a-f]{128}$/.test(hashHex)) {
        return false;
    }

    const hashOriginal = Buffer.from(hashHex, "hex");

    const hashIngresado = crypto.scryptSync(
        pin,
        Buffer.from(saltHex, "hex"),
        64
    );

    return crypto.timingSafeEqual(
        hashOriginal,
        hashIngresado
    );
}

module.exports = {
    generarPIN,
    generarTokenQR,
    crearHashPIN,
    verificarPIN
};
