
document.addEventListener("DOMContentLoaded", () => {

    const formulario =
        document.getElementById("formRecuperacion");

    const mensaje =
        document.getElementById("mensaje");

    const boton =
        document.getElementById("btnRecuperar");

    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();

        const correo =
            document.getElementById("correo").value.trim();

        boton.disabled = true;
        boton.textContent = "Enviando...";

        mensaje.replaceChildren();

        try {
            const respuesta = await fetch(
                "/api/auth/olvide-contrasena",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ correo })
                }
            );

            const resultado = await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(
                    resultado.error ||
                    "No se pudo procesar la solicitud"
                );
            }

            mensaje.className = "alert alert-success";
            mensaje.textContent =
                resultado.mensaje ||
                "Si el correo está registrado, recibirás un enlace.";

            formulario.reset();

        } catch (error) {
            mensaje.className = "alert alert-danger";
            mensaje.textContent = error.message;

        } finally {
            boton.disabled = false;
            boton.textContent =
                "Enviar enlace de recuperación";
        }
    });
});
