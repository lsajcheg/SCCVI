
const API = "/api/vacunacion";

const form = document.getElementById("formVacunacion");
const mensaje = document.getElementById("mensaje");
const tabla = document.getElementById("tablaVacunacion");

const selectorNino = document.getElementById("id_nino");
const selectorVacuna = document.getElementById("id_vacuna");
const selectorEsquema = document.getElementById("id_esquema");
const filtroNino = document.getElementById("filtroNino");

let ninos = [];
let vacunas = [];
let esquemas = [];
let registros = [];

// ==========================================
// PERMISOS DEL USUARIO
// ==========================================

let rolUsuario = "";
let puedeRegistrar = false;
let puedeEditar = false;
let puedeEliminar = false;

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

    puedeRegistrar = [
        "administrador",
        "medico",
        "enfermero"
    ].includes(rolUsuario);

    puedeEditar = puedeRegistrar;

    puedeEliminar = rolUsuario === "administrador";

    // Ocultar el formulario completo al encargado.
    if (!puedeRegistrar) {
        const tarjetaFormulario = form.closest(".card");

        if (tarjetaFormulario) {
            tarjetaFormulario.style.display = "none";
        } else {
            form.style.display = "none";
        }
    }
}

// ==========================================
// FUNCIONES GENERALES
// ==========================================

function fechaISO(valor) {
    return valor ? String(valor).slice(0, 10) : "";
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

async function obtenerJSON(url) {
    const respuesta = await fetch(url, {
        credentials: "same-origin"
    });

    if (respuesta.status === 401) {
        window.top.location.replace("/login");
        throw new Error("La sesión ha finalizado");
    }

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(
            datos.error || "Error al consultar datos"
        );
    }

    return datos;
}

// ==========================================
// CARGAR NIÑOS
// ==========================================

async function cargarNinos() {
    ninos = await obtenerJSON("/api/ninos");

    selectorNino.replaceChildren(
        new Option("Seleccione un niño", "")
    );

    filtroNino.replaceChildren(
        new Option("Todos los niños", "")
    );

    ninos.forEach(nino => {
        const nombre =
            `${nino.nombres} ${nino.apellidos}`;

        selectorNino.add(
            new Option(
                `${nombre} (ID ${nino.id_nino})`,
                nino.id_nino
            )
        );

        filtroNino.add(
            new Option(
                `${nombre} (ID ${nino.id_nino})`,
                nino.id_nino
            )
        );
    });
}

// ==========================================
// CARGAR VACUNAS ACTIVAS
// ==========================================

async function cargarVacunas() {
    vacunas = await obtenerJSON(`${API}/vacunas`);

    selectorVacuna.replaceChildren(
        new Option("Seleccione una vacuna", "")
    );

    vacunas.forEach(vacuna => {
        selectorVacuna.add(
            new Option(
                vacuna.nombre,
                vacuna.id_vacuna
            )
        );
    });
}

// ==========================================
// CARGAR ESQUEMA DE VACUNACIÓN
// ==========================================

async function cargarEsquemas() {
    esquemas = await obtenerJSON(`${API}/esquema`);
}

// ==========================================
// MOSTRAR DOSIS DISPONIBLES
// ==========================================

function actualizarDosis() {
    const idVacuna = Number(selectorVacuna.value);

    selectorEsquema.replaceChildren(
        new Option("Seleccione una dosis", "")
    );

    const disponibles = esquemas.filter(
        esquema => esquema.id_vacuna === idVacuna
    );

    disponibles.forEach(esquema => {
        selectorEsquema.add(
            new Option(
                `Dosis ${esquema.numero_dosis} - ` +
                `${esquema.edad_recomendada_meses} meses`,
                esquema.id_esquema
            )
        );
    });

    document.getElementById("detalleDosis").textContent =
        disponibles.length
            ? "Seleccione la dosis que fue administrada."
            : idVacuna
                ? "Esta vacuna no tiene dosis configuradas."
                : "";
}

// ==========================================
// MOSTRAR DETALLE DE DOSIS
// ==========================================

function mostrarDetalleDosis() {
    const esquema = esquemas.find(
        e => e.id_esquema === Number(selectorEsquema.value)
    );

    const detalle = document.getElementById("detalleDosis");

    if (!esquema) {
        detalle.textContent = "";
        return;
    }

    detalle.textContent =
        `Edad de referencia: ${esquema.edad_recomendada_meses} meses. ` +
        (esquema.observaciones || "");
}

// ==========================================
// CARGAR HISTORIAL DE VACUNACIÓN
// ==========================================

async function cargarRegistros() {
    registros = await obtenerJSON(API);
    mostrarHistorial();
}

// ==========================================
// MOSTRAR HISTORIAL
// ==========================================

function mostrarHistorial() {
    tabla.replaceChildren();

    const filtrados = registros.filter(registro =>
        !filtroNino.value ||
        registro.id_nino === Number(filtroNino.value)
    );

    if (!filtrados.length) {
        const fila = document.createElement("tr");

        const celda = crearCelda(
            fila,
            "No hay registros de vacunación."
        );

        celda.colSpan = 6;
        celda.className = "text-center text-muted";

        tabla.appendChild(fila);
        return;
    }

    filtrados.forEach(registro => {
        const fila = document.createElement("tr");

        crearCelda(
            fila,
            `${registro.nombres} ${registro.apellidos}`
        );

        crearCelda(fila, registro.vacuna);

        crearCelda(fila, registro.numero_dosis);

        crearCelda(
            fila,
            fechaISO(registro.fecha_aplicacion)
        );

        crearCelda(
            fila,
            fechaISO(registro.proxima_dosis) ||
            "No registrada"
        );

        // ==================================
        // ACCIONES SEGÚN PERMISOS
        // ==================================

        const acciones = document.createElement("td");

        // Administrador, médico y enfermero.
        if (puedeEditar) {
            const editar = document.createElement("button");

            editar.textContent = "Editar";

            editar.className =
                "btn btn-warning btn-sm me-2";

            editar.onclick = () =>
                editarRegistro(
                    registro.id_registro_vacuna
                );

            acciones.appendChild(editar);
        }

        // Solo administrador.
        if (puedeEliminar) {
            const eliminar = document.createElement("button");

            eliminar.textContent = "Eliminar";

            eliminar.className =
                "btn btn-danger btn-sm";

            eliminar.onclick = () =>
                eliminarRegistro(
                    registro.id_registro_vacuna
                );

            acciones.appendChild(eliminar);
        }

        // Encargado.
        if (!puedeEditar && !puedeEliminar) {
            acciones.textContent = "Solo consulta";
        }

        fila.appendChild(acciones);
        tabla.appendChild(fila);
    });
}

// ==========================================
// REGISTRAR O ACTUALIZAR VACUNACIÓN
// ==========================================

form.addEventListener("submit", async evento => {
    evento.preventDefault();

    if (!puedeRegistrar) {
        mostrarMensaje(
            "No tiene permisos para registrar o modificar vacunas.",
            "danger"
        );
        return;
    }

    const id = document.getElementById(
        "id_registro_vacuna"
    ).value;

    const datos = {
        id_nino: selectorNino.value,

        id_esquema: selectorEsquema.value,

        fecha_aplicacion:
            document.getElementById(
                "fecha_aplicacion"
            ).value,

        proxima_dosis:
            document.getElementById(
                "proxima_dosis"
            ).value || null,

        observaciones:
            document.getElementById(
                "observaciones"
            ).value.trim()
    };

    try {
        const respuesta = await fetch(
            id ? `${API}/${id}` : API,
            {
                method: id ? "PUT" : "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(datos)
            }
        );

        if (respuesta.status === 401) {
            window.top.location.replace("/login");
            return;
        }

        const resultado = await respuesta.json();

        // Mantener la validación de dosis duplicada.
        if (respuesta.status === 409) {
            mostrarMensaje(
                resultado.error +
                ". Utilice Editar si necesita corregir el registro.",
                "warning"
            );
            return;
        }

        if (!respuesta.ok) {
            throw new Error(
                resultado.error ||
                "Error al guardar vacunación"
            );
        }

        limpiarFormulario();

        await cargarRegistros();

        mostrarMensaje(resultado.mensaje);

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
});

// ==========================================
// EDITAR REGISTRO
// ==========================================

function editarRegistro(id) {
    if (!puedeEditar) {
        mostrarMensaje(
            "No tiene permisos para editar registros.",
            "danger"
        );
        return;
    }

    const registro = registros.find(
        r => r.id_registro_vacuna === id
    );

    if (!registro) return;

    const esquema = esquemas.find(
        e => e.id_esquema === registro.id_esquema
    );

    if (!esquema) {
        mostrarMensaje(
            "La dosis del registro ya no está disponible en el esquema activo.",
            "warning"
        );
        return;
    }

    document.getElementById(
        "id_registro_vacuna"
    ).value = registro.id_registro_vacuna;

    selectorNino.value = registro.id_nino;

    selectorVacuna.value = esquema.id_vacuna;

    actualizarDosis();

    selectorEsquema.value = registro.id_esquema;

    mostrarDetalleDosis();

    document.getElementById(
        "fecha_aplicacion"
    ).value = fechaISO(
        registro.fecha_aplicacion
    );

    document.getElementById(
        "proxima_dosis"
    ).value = fechaISO(
        registro.proxima_dosis
    );

    document.getElementById(
        "observaciones"
    ).value = registro.observaciones || "";

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

// ==========================================
// ELIMINAR REGISTRO
// ==========================================

async function eliminarRegistro(id) {
    if (!puedeEliminar) {
        mostrarMensaje(
            "No tiene permisos para eliminar registros.",
            "danger"
        );
        return;
    }

    if (!confirm(
        "¿Está seguro de eliminar este registro de vacunación?"
    )) {
        return;
    }

    try {
        const respuesta = await fetch(
            `${API}/${id}`,
            {
                method: "DELETE",
                credentials: "same-origin"
            }
        );

        if (respuesta.status === 401) {
            window.top.location.replace("/login");
            return;
        }

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                resultado.error || "Error al eliminar"
            );
        }

        await cargarRegistros();

        mostrarMensaje(resultado.mensaje);

    } catch (error) {
        mostrarMensaje(error.message, "danger");
    }
}

// ==========================================
// LIMPIAR FORMULARIO
// ==========================================

function limpiarFormulario() {
    form.reset();

    document.getElementById(
        "id_registro_vacuna"
    ).value = "";

    document.getElementById(
        "detalleDosis"
    ).textContent = "";

    actualizarDosis();
}

// ==========================================
// EVENTOS
// ==========================================

selectorVacuna.addEventListener(
    "change",
    actualizarDosis
);

selectorEsquema.addEventListener(
    "change",
    mostrarDetalleDosis
);

filtroNino.addEventListener(
    "change",
    mostrarHistorial
);

// ==========================================
// INICIALIZAR MÓDULO
// ==========================================

async function iniciar() {
    try {
        // Primero consultar los permisos.
        await verificarPermisos();

        // Después cargar la información.
        await Promise.all([
            cargarNinos(),
            cargarVacunas(),
            cargarEsquemas()
        ]);

        await cargarRegistros();

    } catch (error) {
        console.error("ERROR VACUNACIÓN:", error);

        mostrarMensaje(error.message, "danger");
    }
}

iniciar();

