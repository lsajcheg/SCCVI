
// ==========================================
// SCCVI - ALERTAS E HISTORIAL
// ==========================================

const API = "/api/alertas/vacunacion";
const API_HISTORIAL = "/api/historial-alertas";

const tabla = document.getElementById("tablaAlertas");
const mensaje = document.getElementById("mensajeAlertas");
const buscador = document.getElementById("buscarAlerta");
const filtroEstado = document.getElementById("filtroEstado");

const tablaHistorial = document.getElementById(
    "tablaHistorialAlertas"
);

let alertas = [];
let historial = [];
let puedeGestionar = false;

// ==========================================
// MENSAJES
// ==========================================
function mostrarMensaje(texto, tipo = "danger") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

function limpiarMensaje() {
    mensaje.textContent = "";
    mensaje.className = "alert d-none";
}

// ==========================================
// CONSULTAR API
// ==========================================
async function consultarAPI(ruta, opciones = {}) {
    const respuesta = await fetch(ruta, {
        credentials: "same-origin",
        cache: "no-store",
        ...opciones
    });

    if (respuesta.status === 401) {
        window.top.location.replace("/login");
        throw new Error("Debe iniciar sesión");
    }

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        const error = new Error(
            datos.error || "Error al consultar el servidor"
        );
        error.status = respuesta.status;
        throw error;
    }

    return datos;
}

// ==========================================
// CONSULTAR PERMISOS
// ==========================================
async function cargarPermisos() {
    const datos = await consultarAPI("/api/auth/sesion");

    const rol = datos.usuario?.rol;

    puedeGestionar = [
        "administrador",
        "medico",
        "enfermero"
    ].includes(rol);
}

// ==========================================
// CREAR CELDAS
// ==========================================
function crearCelda(fila, texto) {
    const celda = document.createElement("td");
    celda.textContent = texto ?? "";
    fila.appendChild(celda);
    return celda;
}

// ==========================================
// FORMATEAR FECHAS
// ==========================================
function formatearFecha(fecha) {
    if (!fecha) return "Sin fecha";

    const partes = fecha.split("-");

    if (partes.length !== 3) return fecha;

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// ==========================================
// CONSULTAR SEGUIMIENTO
// ==========================================
async function cargarAlertas() {
    alertas = await consultarAPI(API);

    actualizarIndicadores();
    mostrarAlertas();
}

// ==========================================
// ACTUALIZAR INDICADORES
// ==========================================
function actualizarIndicadores() {
    const pendientes = alertas.filter(
        a => a.estado_seguimiento === "pendiente"
    ).length;

    const proximas = alertas.filter(
        a => a.estado_seguimiento === "proxima"
    ).length;

    document.getElementById("totalAlertas").textContent =
        alertas.length;

    document.getElementById("totalPendientes").textContent =
        pendientes;

    document.getElementById("totalProximas").textContent =
        proximas;
}

// ==========================================
// MOSTRAR SEGUIMIENTO
// ==========================================
function mostrarAlertas() {
    tabla.replaceChildren();

    const texto = buscador.value.trim().toLowerCase();
    const estado = filtroEstado.value;

    const filtradas = alertas.filter(alerta => {
        const nombre =
            `${alerta.nombres} ${alerta.apellidos}`
                .toLowerCase();

        const vacuna = (alerta.vacuna || "")
            .toLowerCase();

        return (
            (nombre.includes(texto) ||
             vacuna.includes(texto)) &&
            (!estado ||
             alerta.estado_seguimiento === estado)
        );
    });

    if (!filtradas.length) {
        const fila = document.createElement("tr");
        const celda = crearCelda(
            fila,
            "No se encontraron alertas de vacunación."
        );

        celda.colSpan = 7;
        celda.className = "text-center text-muted";

        tabla.appendChild(fila);
        return;
    }

    filtradas.forEach(alerta => {
        const fila = document.createElement("tr");

        crearCelda(
            fila,
            `${alerta.nombres} ${alerta.apellidos}`
        );

        crearCelda(fila, alerta.vacuna);
        crearCelda(fila, alerta.numero_dosis);

        crearCelda(
            fila,
            `${alerta.edad_recomendada_meses} meses`
        );

        crearCelda(
            fila,
            formatearFecha(alerta.fecha_recomendada)
        );

        const celdaEstado = document.createElement("td");
        const etiqueta = document.createElement("span");

        const pendiente =
            alerta.estado_seguimiento === "pendiente";

        etiqueta.textContent = pendiente
            ? "Pendiente"
            : "Próxima";

        etiqueta.className = pendiente
            ? "badge text-bg-warning"
            : "badge text-bg-primary";

        
celdaEstado.appendChild(etiqueta);
fila.appendChild(celdaEstado);

// ==========================================
// ESTADO DE LA ALERTA REGISTRADA
// ==========================================
const alertaRegistrada = historial.find(
    h =>
        Number(h.id_nino) === Number(alerta.id_nino) &&
        Number(h.id_esquema) === Number(alerta.id_esquema) &&
        h.tipo_alerta === "vacunacion"
);

const celdaEstadoAlerta = document.createElement("td");
const etiquetaAlerta = document.createElement("span");

const estadosAlerta = {
    pendiente: {
        texto: "Pendiente",
        clase: "text-bg-warning"
    },
    en_seguimiento: {
        texto: "En seguimiento",
        clase: "text-bg-info"
    },
    atendida: {
        texto: "Atendida",
        clase: "text-bg-success"
    },
    cerrada: {
        texto: "Cerrada",
        clase: "text-bg-secondary"
    }
};

if (alertaRegistrada) {
    const configuracion =
        estadosAlerta[alertaRegistrada.estado];

    etiquetaAlerta.textContent = configuracion
        ? configuracion.texto
        : alertaRegistrada.estado;

    etiquetaAlerta.className = configuracion
        ? `badge ${configuracion.clase}`
        : "badge text-bg-secondary";
} else {
    etiquetaAlerta.textContent = "Sin alerta";
    etiquetaAlerta.className =
        "badge text-bg-light border text-dark";
}

celdaEstadoAlerta.appendChild(etiquetaAlerta);
fila.appendChild(celdaEstadoAlerta);

// ==========================================
// ACCIONES
// ==========================================
const acciones = document.createElement("td");

const registrada = alertaRegistrada;

if (registrada) {
    const indicador = document.createElement("span");

    indicador.className = "badge text-bg-secondary";
    indicador.textContent = "Registrada";

    acciones.appendChild(indicador);

} else if (puedeGestionar) {
    const boton = document.createElement("button");

    boton.type = "button";
    boton.className = "btn btn-primary btn-sm";
    boton.textContent = "Registrar alerta";

    boton.addEventListener("click", () => {
        registrarAlerta(alerta, boton);
    });

    acciones.appendChild(boton);

} else {
    acciones.textContent = "Solo consulta";
}

fila.appendChild(acciones);
tabla.appendChild(fila);


    });
}

// ==========================================
// REGISTRAR ALERTA
// ==========================================
async function registrarAlerta(alerta, boton) {
    if (!puedeGestionar) return;

    const nombre =
        `${alerta.nombres} ${alerta.apellidos}`;

    const confirmar = confirm(
        `¿Desea registrar una alerta de vacunación?\n\n` +
        `Niño: ${nombre}\n` +
        `Vacuna: ${alerta.vacuna}\n` +
        `Dosis: ${alerta.numero_dosis}`
    );

    if (!confirmar) return;

    boton.disabled = true;

    try {
        const descripcion =
            `Seguimiento de vacunación. ` +
            `Vacuna: ${alerta.vacuna}. ` +
            `Dosis: ${alerta.numero_dosis}. ` +
            `Fecha recomendada: ` +
            `${alerta.fecha_recomendada}.`;

        await consultarAPI(API_HISTORIAL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                id_nino: alerta.id_nino,
                id_esquema: alerta.id_esquema,
                descripcion
            })
        });

        await Promise.all([
            cargarHistorial(),
            cargarAlertas()
        ]);

        mostrarMensaje(
            "Alerta registrada correctamente",
            "success"
        );

    } catch (error) {
        mostrarMensaje(error.message, "danger");
        boton.disabled = false;
    }
}

// ==========================================
// CONSULTAR HISTORIAL
// ==========================================
async function cargarHistorial() {
    historial = await consultarAPI(API_HISTORIAL);

    mostrarHistorial();
    mostrarAlertas();
}

// ==========================================
// MOSTRAR HISTORIAL
// ==========================================

function mostrarHistorial() {
    if (!tablaHistorial) return;

    tablaHistorial.replaceChildren();

    if (!historial.length) {
        const fila = document.createElement("tr");
        const celda = crearCelda(
            fila,
            "Todavía no existen alertas registradas."
        );

        celda.colSpan = 7;
        celda.className = "text-center text-muted";

        tablaHistorial.appendChild(fila);
        return;
    }

    historial.forEach(alerta => {
        const fila = document.createElement("tr");

        crearCelda(
            fila,
            `${alerta.nombres} ${alerta.apellidos}`
        );

        crearCelda(
            fila,
            alerta.vacuna || alerta.tipo_alerta
        );

        crearCelda(
            fila,
            alerta.numero_dosis ?? "-"
        );

        crearCelda(
            fila,
            alerta.fecha_alerta
        );

        crearCelda(
            fila,
            alerta.descripcion || "-"
        );

        // ==========================================
        // ESTADO DE LA ALERTA
        // ==========================================
        const celdaEstado = document.createElement("td");

        const selector = document.createElement("select");
        selector.className = "form-select form-select-sm";

        const estados = [
            ["pendiente", "Pendiente"],
            ["en_seguimiento", "En seguimiento"],
            ["atendida", "Atendida"],
            ["cerrada", "Cerrada"]
        ];

        estados.forEach(([valor, etiqueta]) => {
            selector.add(new Option(etiqueta, valor));
        });

        selector.value = alerta.estado;
        selector.disabled = !puedeGestionar;

        celdaEstado.appendChild(selector);
        fila.appendChild(celdaEstado);

        // ==========================================
        // ACCIONES
        // ==========================================
        const acciones = document.createElement("td");

        // Guardar: administrador, médico y enfermero.
        if (puedeGestionar) {
            const guardar = document.createElement("button");

            guardar.type = "button";
            guardar.className = "btn btn-success btn-sm";
            guardar.textContent = "Guardar";

            guardar.addEventListener("click", async () => {
                guardar.disabled = true;

                try {
                    await actualizarEstado(
                        alerta.id_alerta,
                        selector.value
                    );
                } finally {
                    guardar.disabled = false;
                }
            });

            acciones.appendChild(guardar);
        }

        // ==========================================
        // VER MOVIMIENTOS
        // Disponible para todos los roles autorizados
        // a consultar el historial.
        // ==========================================
        const botonMovimientos = document.createElement("button");

        botonMovimientos.type = "button";
        botonMovimientos.className =
            "btn btn-outline-primary btn-sm ms-2";

        botonMovimientos.textContent = "Ver movimientos";

        botonMovimientos.addEventListener("click", () => {
            verMovimientos(alerta.id_alerta);
        });

        acciones.appendChild(botonMovimientos);

        fila.appendChild(acciones);
        tablaHistorial.appendChild(fila);
    });
}


// ==========================================
// ACTUALIZAR ESTADO
// ==========================================
async function actualizarEstado(id, estado) {
    try {
        await consultarAPI(
            `${API_HISTORIAL}/${id}/estado`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ estado })
            }
        );

        await cargarHistorial();
        mostrarAlertas();

        mostrarMensaje(
            "Estado actualizado correctamente",
            "success"
        );

    } catch (error) {
        mostrarMensaje(error.message, "danger");
        await cargarHistorial().catch(console.error);
    }
}

// ==========================================
// FILTROS
// ==========================================
buscador.addEventListener("input", mostrarAlertas);

filtroEstado.addEventListener(
    "change",
    mostrarAlertas
);

// ==========================================
// INICIAR
// ==========================================
async function iniciarAlertas() {
    try {
        limpiarMensaje();

        await cargarPermisos();

        await cargarHistorial();

        await cargarAlertas();

    } catch (error) {
        console.error("ERROR INICIAR ALERTAS:", error);
        mostrarMensaje(error.message, "danger");
    }
}


// ==========================================
// CONSULTAR MOVIMIENTOS DE UNA ALERTA
// ==========================================
async function verMovimientos(idAlerta) {
    const tabla = document.getElementById("tablaMovimientos");
    const modalElemento = document.getElementById("modalMovimientos");

    if (!tabla || !modalElemento) {
        console.error("No se encontró el modal de movimientos");
        return;
    }

    tabla.replaceChildren();

    const modal = bootstrap.Modal.getOrCreateInstance(modalElemento);
    modal.show();

    const mensaje = document.createElement("tr");
    const celdaMensaje = document.createElement("td");

    celdaMensaje.colSpan = 5;
    celdaMensaje.textContent = "Cargando movimientos...";
    celdaMensaje.className = "text-center";

    mensaje.appendChild(celdaMensaje);
    tabla.appendChild(mensaje);

    try {
        const movimientos = await consultarAPI(
            `/api/historial-alertas/${idAlerta}/movimientos`
        );

        tabla.replaceChildren();

        if (!movimientos.length) {
            celdaMensaje.textContent =
                "Esta alerta todavía no tiene movimientos registrados.";

            tabla.appendChild(mensaje);
            return;
        }

        const estados = {
            pendiente: "Pendiente",
            en_seguimiento: "En seguimiento",
            atendida: "Atendida",
            cerrada: "Cerrada"
        };

        movimientos.forEach(movimiento => {
            const fila = document.createElement("tr");

            const valores = [
                movimiento.fecha_movimiento,
                `${movimiento.nombres} ${movimiento.apellidos}`,
                movimiento.rol || "Sin rol",
                estados[movimiento.estado_anterior] ||
                    movimiento.estado_anterior,
                estados[movimiento.estado_nuevo] ||
                    movimiento.estado_nuevo
            ];

            valores.forEach(valor => {
                const celda = document.createElement("td");
                celda.textContent = valor;
                fila.appendChild(celda);
            });

            tabla.appendChild(fila);
        });

    } catch (error) {
        tabla.replaceChildren();
        celdaMensaje.textContent = error.message;
        tabla.appendChild(mensaje);
    }
}


iniciarAlertas();
