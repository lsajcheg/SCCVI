
document.addEventListener("DOMContentLoaded", () => {
    const formulario = document.getElementById("formRestablecer");
    const mensaje = document.getElementById("mensaje");
    const boton = document.getElementById("btnRestablecer");

    const parametros = new URLSearchParams(window.location.search);
    const token = parametros.get("token");

    // Evitar conservar el token en el historial de navegación.
    window.history.replaceState(
        null,
        "",
        window.location.pathname
    );

    function mostrarMensaje(texto, tipo) {
        mensaje.className = `alert alert-${tipo}`;
        mensaje.textContent = texto;
    }

    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
        mostrarMensaje(
            "El enlace de recuperación no es válido. Solicita uno nuevo.",
            "danger"
        );
        formulario.hidden = true;
        return;
    }

    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();

        const contrasena =
            document.getElementById("contrasena").value;

        const confirmarContrasena =
            document.getElementById("confirmarContrasena").value;

        if (contrasena !== confirmarContrasena) {
            mostrarMensaje(
                "Las contraseñas no coinciden.",
                "warning"
            );
            return;
        }

        if (
            contrasena.length < 8 ||
            new TextEncoder().encode(contrasena).length > 72
        ) {
            mostrarMensaje(
                "La contraseña debe tener al menos 12 caracteres y un máximo de 72 bytes.",
                "warning"
            );
            return;
        }

        boton.disabled = true;
        boton.textContent = "Actualizando...";

        try {
            const respuesta = await fetch(
                "/api/auth/restablecer-contrasena",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        token,
                        contrasena,
                        confirmarContrasena
                    })
                }
            );

            const resultado = await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(
                    resultado.error ||
                    "No se pudo restablecer la contraseña"
                );
            }

            mostrarMensaje(
                "Contraseña actualizada correctamente. Ya puedes iniciar sesión.",
                "success"
            );

            formulario.reset();
            formulario.hidden = true;

        } catch (error) {
            mostrarMensaje(error.message, "danger");

        } finally {
            boton.disabled = false;
            boton.textContent = "Cambiar contraseña";
        }
    });
});
