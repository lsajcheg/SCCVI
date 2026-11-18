
const enlaces = document.querySelectorAll(
    ".menu-link[data-modulo]"
);
const frame = document.getElementById("frameModulo");
const panelInicio = document.getElementById("panelInicio");
const tituloModulo = document.getElementById("tituloModulo");

const nombreUsuario = document.getElementById("nombreUsuario");
const rolUsuario = document.getElementById("rolUsuario");
const btnCerrarSesion = document.getElementById("btnCerrarSesion");
const menuUsuarios = document.getElementById("menuUsuarios");

// ==========================================
// CARGAR INFORMACIÓN DEL USUARIO
// ==========================================
async function cargarUsuario() {
    try {
        const respuesta = await fetch("/api/auth/sesion", {
            credentials: "same-origin",
            cache: "no-store"
        });

        if (respuesta.status === 401) {
            window.location.replace("/login");
            return;
        }

        if (!respuesta.ok) {
            throw new Error("Error al consultar la sesión");
        }

        const datos = await respuesta.json();
        const usuario = datos.usuario;

        nombreUsuario.textContent =
            `${usuario.nombres} ${usuario.apellidos}`;

        rolUsuario.textContent =
            `Rol: ${usuario.rol}`;

       /* if (usuario.rol === "administrador") {
            menuUsuarios.hidden = false;
        }*/

            
// Mostrar administración de usuarios únicamente
// al administrador.
menuUsuarios.hidden =
    usuario.rol !== "administrador";

// Restringir los módulos de configuración
// según el rol del usuario.
document.querySelectorAll(
    '[data-modulo="/vacunas"], [data-modulo="/esquema"]'
).forEach(enlace => {
    enlace.hidden = ![
        "administrador",
        "medico",
        "enfermero"
    ].includes(usuario.rol);
});

// Cargar estadísticas después de verificar la sesión.
if (typeof window.cargarDashboard === "function") {
    await window.cargarDashboard();
}




    } catch (error) {
        console.error(error);
        nombreUsuario.textContent = "Error de sesión";
    }
}

// ==========================================
// ABRIR MÓDULOS EN EL PANEL DERECHO
// ==========================================
/*function abrirModulo(modulo, titulo) {
    tituloModulo.textContent = titulo;

    if (modulo === "inicio") {
        frame.classList.remove("visible");
        frame.removeAttribute("src");
        panelInicio.style.display = "block";
        return;
    }

    /*if (modulo === "usuarios") {
        // Se habilitará cuando desarrollemos
        // el módulo de administración.
        tituloModulo.textContent =
            "Administración de Usuarios";

        frame.classList.remove("visible");
        frame.removeAttribute("src");
        panelInicio.style.display = "block";

        panelInicio.querySelector("h3").textContent =
            "Administración de Usuarios";

        panelInicio.querySelector("p").textContent =
            "Este apartado estará disponible próximamente.";

        return;
    }*/

   /* panelInicio.style.display = "none";
    frame.classList.add("visible");

    // Carga la página existente dentro del panel.
    frame.src = modulo;
}*/


function abrirModulo(modulo, titulo) {
    tituloModulo.textContent = titulo;

    if (modulo === "inicio") {
        frame.classList.remove("visible");
        frame.removeAttribute("src");

        panelInicio.style.display = "block";

        // Actualizar estadísticas al regresar al inicio.
        if (typeof window.cargarDashboard === "function") {
            window.cargarDashboard();
        }

        return;
    }

    panelInicio.style.display = "none";
    frame.classList.add("visible");

    // Cargar el módulo seleccionado en el panel derecho.
    frame.src = modulo;
}


// ==========================================
// EVENTOS DEL MENÚ
// ==========================================
enlaces.forEach(enlace => {
    enlace.addEventListener("click", evento => {
        evento.preventDefault();

        enlaces.forEach(item =>
            item.classList.remove("active")
        );

        enlace.classList.add("active");

        abrirModulo(
            enlace.dataset.modulo,
            enlace.dataset.titulo
        );
    });
});

// ==========================================
// CERRAR SESIÓN
// ==========================================
btnCerrarSesion.addEventListener("click", async () => {
    btnCerrarSesion.disabled = true;

    try {
        const respuesta = await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin"
        });

        if (!respuesta.ok) {
            throw new Error("No se pudo cerrar sesión");
        }

        window.location.replace("/login");

    } catch (error) {
        alert(error.message);
        btnCerrarSesion.disabled = false;
    }
});

// ==========================================
// INICIAR
// ==========================================
cargarUsuario();

