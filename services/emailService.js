
const {
    clienteMicrosoft,
    cargarCache
} = require("./microsoftAuthService");

const PERMISOS = [
    "https://graph.microsoft.com/Mail.Send"
];

async function obtenerTokenCorreo() {
    await cargarCache();
    const cache = clienteMicrosoft.getTokenCache();

    const cuentas = await cache.getAllAccounts();

    if (!cuentas.length) {
        throw new Error(
            "Outlook no está autorizado. Ejecute autorizarOutlook.js"
        );
    }

    const resultado = await clienteMicrosoft.acquireTokenSilent({
        account: cuentas[0],
        scopes: PERMISOS
    });

    return resultado.accessToken;
}

async function enviarCorreo(destinatario, asunto, contenidoHTML) {
    const token = await obtenerTokenCorreo();

    const respuesta = await fetch(
        "https://graph.microsoft.com/v1.0/me/sendMail",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: {
                    subject: asunto,
                    body: {
                        contentType: "HTML",
                        content: contenidoHTML
                    },
                    toRecipients: [
                        {
                            emailAddress: {
                                address: destinatario
                            }
                        }
                    ]
                },
                saveToSentItems: true
            })
        }
    );

    if (!respuesta.ok) {
        const detalle = await respuesta.text();

        throw new Error(
            `Error de Microsoft Graph (${respuesta.status}): ${detalle}`
        );
    }

    return {
        mensaje: "Correo aceptado por Microsoft Graph"
    };
}

module.exports = {
    enviarCorreo
};
