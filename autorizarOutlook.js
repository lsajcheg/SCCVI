
require("dotenv").config();

const {
    autorizarOutlook
} = require("./services/microsoftAuthService");

async function iniciar() {
    try {
        console.log("Iniciando autorización de Outlook...");

        const resultado = await autorizarOutlook();

        console.log(
            "Cuenta autorizada:",
            resultado.account?.username
        );

        console.log(
            "Autorización completada correctamente."
        );

    } catch (error) {
        console.error(
            "Error al autorizar Outlook:",
            error.message
        );
    }
}

iniciar();
