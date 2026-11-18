
const QRCode = require("qrcode");

async function generarQR(token) {
    const baseURL = process.env.PUBLIC_BASE_URL;

    if (!baseURL) {
        throw new Error(
            "PUBLIC_BASE_URL no está configurada"
        );
    }

    const url = new URL(
        `/consulta-carnet/${encodeURIComponent(token)}`,
        baseURL
    ).toString();

    return QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        width: 300,
        margin: 2
    });
}

module.exports = { generarQR };
