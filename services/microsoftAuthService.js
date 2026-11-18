
const msal = require("@azure/msal-node");
const fs = require("fs");
const path = require("path");

const clientId = process.env.MICROSOFT_CLIENT_ID;

if (!clientId) {
    throw new Error(
        "Falta MICROSOFT_CLIENT_ID en el archivo .env"
    );
}

const rutaCache = path.join(
    __dirname,
    "../.private/msal-cache.json"
);

const clienteMicrosoft = new msal.PublicClientApplication({
    auth: {
        clientId,
        authority:
            "https://login.microsoftonline.com/consumers"
    }
});

const permisos = [
    "https://graph.microsoft.com/Mail.Send"
];

async function cargarCache() {
    if (fs.existsSync(rutaCache)) {
        const contenido = fs.readFileSync(
            rutaCache,
            "utf8"
        );

        clienteMicrosoft
            .getTokenCache()
            .deserialize(contenido);
    }
}

async function guardarCache() {
    const carpeta = path.dirname(rutaCache);

    fs.mkdirSync(carpeta, {
        recursive: true,
        mode: 0o700
    });

    const contenido = clienteMicrosoft
        .getTokenCache()
        .serialize();

    fs.writeFileSync(
        rutaCache,
        contenido,
        { mode: 0o600 }
    );
}

async function autorizarOutlook() {
    await cargarCache();

    const cache = clienteMicrosoft.getTokenCache();
    const cuentas = await cache.getAllAccounts();

    let resultado;

    if (cuentas.length > 0) {
        try {
            resultado = await clienteMicrosoft.acquireTokenSilent({
                account: cuentas[0],
                scopes: permisos
            });
        } catch (error) {
            console.log(
                "Se requiere renovar la autorización."
            );
        }
    }

    if (!resultado) {
        resultado = await clienteMicrosoft.acquireTokenByDeviceCode({
            scopes: permisos,
            deviceCodeCallback: (respuesta) => {
                console.log(respuesta.message);
            }
        });
    }

    await guardarCache();

    return resultado;
}

module.exports = {
    clienteMicrosoft,
    autorizarOutlook,
    cargarCache
};
