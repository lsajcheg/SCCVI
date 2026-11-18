

"use strict";

// ==========================================
// CONFIGURACIÓN WHATSAPP CLOUD API
// ==========================================

const API_VERSION =
    process.env.WHATSAPP_API_VERSION || "v25.0";

// ==========================================
// FUNCIÓN GENERAL PARA ENVIAR A META
// ==========================================

async function realizarEnvio(payload) {

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId =
        process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
        throw new Error(
            "Falta configurar WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID"
        );
    }

    const url =
        `https://graph.facebook.com/${API_VERSION}/` +
        `${phoneNumberId}/messages`;

    const respuesta = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        console.error(
            "ERROR DE META:",
            JSON.stringify(datos, null, 2)
        );

        throw new Error(
            datos.error?.message ||
            "Error al enviar mensaje mediante WhatsApp"
        );
    }

    console.log("MENSAJE ACEPTADO POR META:", {
        id_mensaje: datos.messages?.[0]?.id
    });

    return datos;
}

// ==========================================
// ENVIAR MENSAJE DE TEXTO
// ==========================================

async function enviarWhatsApp(telefono, mensaje) {

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: String(telefono),
        type: "text",
        text: {
            preview_url: false,
            body: mensaje
        }
    };

    return await realizarEnvio(payload);
}

// ==========================================
// ENVIAR PLANTILLA HELLO_WORLD
// ==========================================

async function enviarPlantillaPrueba(telefono) {

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: String(telefono),
        type: "template",
        template: {
            name: "hello_world",
            language: {
                code: "en_US"
            }
        }
    };

    return await realizarEnvio(payload);
}

 // ==========================================
 // ENVIAR RECORDATORIO DE VACUNACIÓN
 // ==========================================

async function enviarRecordatorioVacuna(
    telefono,
    nombreResponsable,
    vacuna,
    dosis,
    fecha
) {

    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: String(telefono),
        type: "template",
        template: {
            name: "sccvi_recordatorio_vacuna",
            language: {
                code: "es"
            },
            components: [
                {
                    type: "body",
                    parameters: [
                        {
                            type: "text",
                            text: String(nombreResponsable)
                        },
                        {
                            type: "text",
                            text: String(vacuna)
                        },
                        {
                            type: "text",
                            text: String(dosis)
                        },
                        {
                            type: "text",
                            text: String(fecha)
                        }
                    ]
                }
            ]
        }
    };

    return await realizarEnvio(payload);
}


// ==========================================
// EXPORTAR FUNCIONES
// ==========================================

module.exports = {
    enviarWhatsApp,
    enviarPlantillaPrueba,
    enviarRecordatorioVacuna
};
