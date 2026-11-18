
const API = "/api/esquema";

const form = document.getElementById("formEsquema");
const tabla = document.getElementById("tablaEsquema");
const mensaje = document.getElementById("mensaje");

const selectorVacuna = document.getElementById("id_vacuna");
const filtroVacuna = document.getElementById("filtroVacuna");

let vacunas = [];
let esquemas = [];


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
            "No tiene permisos para acceder al esquema de vacunación"
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

// CARGAR VACUNAS
async function cargarVacunas() {
    const respuesta = await fetch("/api/catalogo-vacunas");
    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(datos.error || "Error al cargar vacunas");
    }

    vacunas = datos;

    selectorVacuna.replaceChildren(
        new Option("Seleccione una vacuna", "")
    );

    filtroVacuna.replaceChildren(
        new Option("Todas las vacunas", "")
    );

    vacunas.forEach(vacuna => {
        if (vacuna.estado) {
            selectorVacuna.add(
                new Option(vacuna.nombre, vacuna.id_vacuna)
            );
        }

        filtroVacuna.add(
            new Option(vacuna.nombre, vacuna.id_vacuna)
        );
    });
}

// CARGAR DOSIS
async function cargarEsquemas() {
    const respuesta = await fetch(API);
    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(datos.error || "Error al cargar dosis");
    }

    esquemas = datos;
    mostrarEsquemas();
}

// MOSTRAR DOSIS
function mostrarEsquemas() {
    tabla.replaceChildren();

    const filtrados = esquemas.filter(esquema =>
        !filtroVacuna.value ||
        esquema.id_vacuna === Number(filtroVacuna.value)
    );

    if (!filtrados.length) {
        const fila = document.createElement("tr");

        const celda = crearCelda(
            fila, "No hay dosis registradas."
        );

        celda.colSpan = 6;
        celda.className = "text-center text-muted";

        tabla.appendChild(fila);
        return;
    }

    filtrados.forEach(esquema => {
        const fila = document.createElement("tr");

        crearCelda(fila, esquema.id_esquema);
        crearCelda(fila, esquema.vacuna);
        crearCelda(fila, esquema.numero_dosis);
        crearCelda(fila, esquema.edad_recomendada_meses);
        crearCelda(fila, esquema.observaciones);

        const acciones = document.createElement("td");

        const editar = document.createElement("button");
        editar.textContent = "Editar";
        editar.className = "btn btn-warning btn-sm me-2";
        editar.onclick = () => editarEsquema(esquema.id_esquema);

        const eliminar = document.createElement("button");
        eliminar.textContent = "Eliminar";
        eliminar.className = "btn btn-danger btn-sm";
        eliminar.onclick = () => eliminarEsquema(esquema.id_esquema);

        acciones.append(editar, eliminar);
        fila.appendChild(acciones);
        tabla.appendChild(fila);
    });
}

// REGISTRAR O EDITAR
form.addEventListener("submit", async evento => {
    evento.preventDefault();

    const id = document.getElementById("id_esquema").value;

    const datos = {
        id_vacuna: selectorVacuna.value,
        numero_dosis: document.getElementById(
            "numero_dosis"
        ).value,
        edad_recomendada_meses: document.getElementById(
            "edad_recomendada_meses"
        ).value,
        observaciones: document.getElementById(
            "observaciones"
        ).value.trim()
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
                resultado.error || "Error al guardar dosis",
                respuesta.status === 409 ? "warning" : "danger"
            );
            return;
        }

        limpiarFormulario();
        await cargarEsquemas();
        mostrarMensaje(resultado.mensaje);

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
});

// EDITAR DOSIS
function editarEsquema(id) {
    const esquema = esquemas.find(
        e => e.id_esquema === id
    );

    if (!esquema) return;

    if (!esquema.estado) {
        mostrarMensaje(
            "La vacuna está inactiva. Actívela antes de editar sus dosis.",
            "warning"
        );
        return;
    }

    document.getElementById("id_esquema").value =
        esquema.id_esquema;

    selectorVacuna.value = esquema.id_vacuna;

    document.getElementById("numero_dosis").value =
        esquema.numero_dosis;

    document.getElementById("edad_recomendada_meses").value =
        esquema.edad_recomendada_meses;

    document.getElementById("observaciones").value =
        esquema.observaciones || "";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// ELIMINAR DOSIS
async function eliminarEsquema(id) {
    if (!confirm(
        "¿Desea eliminar esta dosis? No podrá eliminarse si tiene aplicaciones registradas."
    )) {
        return;
    }

    try {
        const respuesta = await fetch(`${API}/${id}`, {
            method: "DELETE"
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                resultado.error || "Error al eliminar dosis"
            );
        }

        await cargarEsquemas();
        mostrarMensaje(resultado.mensaje);

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

// LIMPIAR FORMULARIO
function limpiarFormulario() {
    form.reset();
    document.getElementById("id_esquema").value = "";
}

filtroVacuna.addEventListener("change", mostrarEsquemas);

// INICIAR
/*async function iniciar() {
    try {
        await Promise.all([
            cargarVacunas(),
            cargarEsquemas()
        ]);
    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

iniciar();*/



// ==========================================
// INICIAR MÓDULO
// ==========================================
async function iniciar() {
    try {
        // Primero verificar los permisos.
        await verificarPermisos();

        // Después cargar vacunas y dosis.
        await Promise.all([
            cargarVacunas(),
            cargarEsquemas()
        ]);

    } catch (error) {
        console.error("ERROR ESQUEMA:", error);

        mostrarMensaje(error.message, "danger");
    }
}

iniciar();

