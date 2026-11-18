
const API = "/api/catalogo-vacunas";

const form = document.getElementById("formVacuna");
const tabla = document.getElementById("tablaVacunas");
const mensaje = document.getElementById("mensaje");
const buscador = document.getElementById("buscarVacuna");

let vacunas = [];



let rolUsuario = "";

const rolesPermitidos = [
    "administrador",
    "medico",
    "enfermero"
];

// ==========================================
// VERIFICAR SESIÓN Y PERMISOS
// ==========================================
async function verificarPermisos() {
    const respuesta = await fetch("/api/auth/sesion", {
        credentials: "same-origin",
        cache: "no-store"
    });

    if (respuesta.status === 401) {
        window.top.location.replace("/login");
        throw new Error("Debe iniciar sesión");
    }

    if (!respuesta.ok) {
        throw new Error("No se pudo verificar la sesión");
    }

    const datos = await respuesta.json();

    if (!datos.usuario) {
        throw new Error("No se encontró el usuario autenticado");
    }

    rolUsuario = datos.usuario.rol;

    if (!rolesPermitidos.includes(rolUsuario)) {
        form.style.display = "none";

        throw new Error(
            "No tiene permisos para acceder al catálogo de vacunas"
        );
    }
}


function mostrarMensaje(texto, tipo = "success") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

function crearCelda(fila, texto) {
    const celda = document.createElement("td");
    celda.textContent = texto ?? "";
    fila.appendChild(celda);
    return celda;
}

// CONSULTAR VACUNAS
async function cargarVacunas() {
    const respuesta = await fetch(API);
    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(datos.error || "Error al cargar vacunas");
    }

    vacunas = datos;
    mostrarVacunas();
}

// MOSTRAR VACUNAS
function mostrarVacunas() {
    tabla.replaceChildren();

    const texto = buscador.value.trim().toLowerCase();

    const filtradas = vacunas.filter(vacuna =>
        vacuna.nombre.toLowerCase().includes(texto)
    );

    if (!filtradas.length) {
        const fila = document.createElement("tr");
        const celda = crearCelda(
            fila, "No se encontraron vacunas."
        );
        celda.colSpan = 5;
        celda.className = "text-center text-muted";
        tabla.appendChild(fila);
        return;
    }

    filtradas.forEach(vacuna => {
        const fila = document.createElement("tr");

        crearCelda(fila, vacuna.id_vacuna);
        crearCelda(fila, vacuna.nombre);
        crearCelda(fila, vacuna.descripcion);

        const estado = crearCelda(
            fila,
            vacuna.estado ? "Activa" : "Inactiva"
        );

        estado.className = vacuna.estado
            ? "text-success fw-bold"
            : "text-danger fw-bold";

        const acciones = document.createElement("td");

        const editar = document.createElement("button");
        editar.textContent = "Editar";
        editar.className = "btn btn-warning btn-sm me-2";
        editar.onclick = () => editarVacuna(vacuna.id_vacuna);

        const cambiarEstado = document.createElement("button");

        cambiarEstado.textContent = vacuna.estado
            ? "Desactivar"
            : "Activar";

        cambiarEstado.className = vacuna.estado
            ? "btn btn-danger btn-sm"
            : "btn btn-success btn-sm";

        cambiarEstado.onclick = () =>
            actualizarEstado(vacuna.id_vacuna, !vacuna.estado);

        acciones.append(editar, cambiarEstado);
        fila.appendChild(acciones);

        tabla.appendChild(fila);
    });
}

// GUARDAR O ACTUALIZAR
form.addEventListener("submit", async evento => {
    evento.preventDefault();

    const id = document.getElementById("id_vacuna").value;

    const datos = {
        nombre: document.getElementById("nombre").value.trim(),
        descripcion: document.getElementById("descripcion").value.trim()
    };

    try {
        const respuesta = await fetch(
            id ? `${API}/${id}` : API,
            {
                method: id ? "PUT" : "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(datos)
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            mostrarMensaje(
                resultado.error || "Error al guardar",
                respuesta.status === 409 ? "warning" : "danger"
            );
            return;
        }

        limpiarFormulario();
        await cargarVacunas();
        mostrarMensaje(resultado.mensaje);

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
});

// EDITAR
function editarVacuna(id) {
    const vacuna = vacunas.find(v => v.id_vacuna === id);

    if (!vacuna) return;

    document.getElementById("id_vacuna").value =
        vacuna.id_vacuna;

    document.getElementById("nombre").value =
        vacuna.nombre;

    document.getElementById("descripcion").value =
        vacuna.descripcion || "";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// ACTIVAR O DESACTIVAR
async function actualizarEstado(id, estado) {
    const accion = estado ? "activar" : "desactivar";

    if (!confirm(`¿Desea ${accion} esta vacuna?`)) {
        return;
    }

    try {
        const respuesta = await fetch(
            `${API}/${id}/estado`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ estado })
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                resultado.error || "Error al cambiar estado"
            );
        }

        await cargarVacunas();
        mostrarMensaje(resultado.mensaje);

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

// LIMPIAR FORMULARIO
function limpiarFormulario() {
    form.reset();
    document.getElementById("id_vacuna").value = "";
}

buscador.addEventListener("input", mostrarVacunas);

/*cargarVacunas().catch(error => {
    mostrarMensaje(error.message, "danger");
});*/



// ==========================================
// INICIALIZAR MÓDULO
// ==========================================
async function iniciar() {
    try {
        // Primero verificar el rol del usuario.
        await verificarPermisos();

        // Después cargar las vacunas.
        await cargarVacunas();

    } catch (error) {
        console.error("ERROR CATÁLOGO VACUNAS:", error);

        mostrarMensaje(error.message, "danger");
    }
}

iniciar();

