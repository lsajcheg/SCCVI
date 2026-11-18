
const formulario = document.getElementById("formLogin");
const mensaje = document.getElementById("mensaje");
const boton = document.getElementById("btnLogin");

formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    mensaje.textContent = "";
    mensaje.className = "";
    boton.disabled = true;

    const datos = {
        usuario: document.getElementById("usuario").value.trim(),
        contrasena: document.getElementById("contrasena").value
    };

    try {
        const respuesta = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify(datos)
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                resultado.error || "No se pudo iniciar sesión"
            );
        }

        window.location.replace("/");

    } catch (error) {
        mensaje.className = "alert alert-danger";
        mensaje.textContent = error.message;
    } finally {
        boton.disabled = false;
    }
});
