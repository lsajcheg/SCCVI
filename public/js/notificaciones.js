
"use strict";

// ==========================================
// VARIABLES
// ==========================================

const API = "/api/notificaciones";

let relacionesNinosResponsables = [];
let historialNotificaciones = [];
let vacunasDelNino = [];
let recordatorios = [];
let calendarioVacunacion = [];

// ==========================================
// INICIALIZACIÓN
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    cargarNinosResponsables();
    cargarHistorial();
    cargarRecordatorios();


    document.getElementById("manualIdNino")
    .addEventListener("change", () => {
        cargarResponsablesManuales();
        cargarVacunasManuales();
    });

document.getElementById("formRecordatorioManual")
    .addEventListener("submit", crearRecordatorioManual);

    document.getElementById("idNino")
        .addEventListener("change", () => {
            cargarResponsablesDelNino();
            cargarVacunasDelNino();
        });

    document.getElementById("formNotificacion")
        .addEventListener("submit", enviarNotificacion);

    document.getElementById("btnActualizar")
        .addEventListener("click", cargarHistorial);

    document.getElementById("buscarNotificacion")
        .addEventListener("input", mostrarHistorial);

    document.getElementById("filtroEstado")
        .addEventListener("change", mostrarHistorial);

    document.getElementById("btnGenerarRecordatorios")
        .addEventListener("click", generarRecordatorios);

    document.getElementById("btnActualizarRecordatorios")
        .addEventListener("click", cargarRecordatorios);

    document.getElementById("tablaRecordatorios")
        .addEventListener("click", manejarAccionRecordatorio);
        cargarCalendario();

document.getElementById("btnActualizarCalendario")
    .addEventListener("click", cargarCalendario);

document.getElementById("buscarCalendario")
    .addEventListener("input", mostrarCalendario);

document.getElementById("filtroCalendario")
    .addEventListener("change", mostrarCalendario);
});

// ==========================================
// MENSAJES
// ==========================================

function mostrarMensaje(texto, tipo = "success") {
    const contenedor =
        document.getElementById("mensajeNotificacion");

    contenedor.className = `alert alert-${tipo}`;
    contenedor.textContent = texto;

    contenedor.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}

// ==========================================
// CONSULTAS HTTP
// ==========================================

async function consultarAPI(ruta, opciones = {}) {

    const respuesta = await fetch(`${API}${ruta}`, {
        credentials: "same-origin",
        cache: "no-store",
        ...opciones
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(
            datos.error || `Error HTTP ${respuesta.status}`
        );
    }

    return datos;
}

// ==========================================
// NIÑOS Y RESPONSABLES
// ==========================================

async function cargarNinosResponsables() {

    const selectNino =
        document.getElementById("idNino");

    selectNino.disabled = true;

    try {
        const datos = await consultarAPI(
            "/ninos-responsables"
        );

        if (!Array.isArray(datos)) {
            throw new Error("Respuesta de niños no válida");
        }

        relacionesNinosResponsables = datos;

        selectNino.replaceChildren(
            new Option("Seleccione un niño", "")
        );

        const ninosUnicos = new Map();

        datos.forEach(item => {
            const id = Number(item.id_nino);

            if (!Number.isSafeInteger(id) || id <= 0) {
                return;
            }

            if (!ninosUnicos.has(id)) {
                const nombre = [
                    item.nombres_nino,
                    item.apellidos_nino
                ].filter(Boolean).join(" ");

                ninosUnicos.set(id, nombre);
            }
        });

        ninosUnicos.forEach((nombre, id) => {
            selectNino.add(
                new Option(nombre, String(id))
            );
        });
        const selectManual =
    document.getElementById("manualIdNino");

selectManual.replaceChildren(
    new Option("Seleccione un niño", "")
);

ninosUnicos.forEach((nombre, id) => {
    selectManual.add(
        new Option(nombre, String(id))
    );
});

    } catch (error) {
        console.error(error);

        selectNino.replaceChildren(
            new Option("Error al cargar niños", "")
        );

        mostrarMensaje(error.message, "danger");

    } finally {
        selectNino.disabled = false;
    }
}

// ==========================================
// RESPONSABLES DEL NIÑO
// ==========================================

function cargarResponsablesDelNino() {

    const idNino = Number(
        document.getElementById("idNino").value
    );

    const selectPadre =
        document.getElementById("idPadre");

    selectPadre.replaceChildren(
        new Option("Seleccione un responsable", "")
    );

    selectPadre.disabled = true;

    if (!idNino) return;

    const responsables =
        relacionesNinosResponsables.filter(
            item => Number(item.id_nino) === idNino
        );

    responsables.forEach(item => {

        const nombre = [
            item.nombres_responsable,
            item.apellidos_responsable
        ].filter(Boolean).join(" ");

        const parentesco = item.parentesco
            ? ` - ${item.parentesco}`
            : "";

        const principal =
            item.responsable_principal === true
                ? " (Principal)"
                : "";

        selectPadre.add(
            new Option(
                nombre + parentesco + principal,
                String(item.id_padre)
            )
        );
    });

    selectPadre.disabled =
        responsables.length === 0;

    const principal = responsables.find(
        item => item.responsable_principal === true
    );

    if (principal) {
        selectPadre.value = String(principal.id_padre);
    }
}

// ==========================================
// VACUNAS DEL NIÑO
// ==========================================

async function cargarVacunasDelNino() {

    const idNino = Number(
        document.getElementById("idNino").value
    );

    const selectVacuna =
        document.getElementById("idEsquema");

    vacunasDelNino = [];

    selectVacuna.replaceChildren(
        new Option("Seleccione una vacuna", "")
    );

    selectVacuna.disabled = true;

    if (!idNino) return;

    try {
        const vacunas = await consultarAPI(
            `/vacunas-pendientes/${idNino}`
        );

        if (!Array.isArray(vacunas)) {
            throw new Error("Respuesta de vacunas no válida");
        }

        // Evitar mostrar datos de una selección anterior.
        if (
            Number(document.getElementById("idNino").value)
            !== idNino
        ) {
            return;
        }

        vacunasDelNino = vacunas;

        vacunas.forEach(vacuna => {
            const fecha = String(
                vacuna.fecha_recomendada || ""
            ).substring(0, 10);

            const texto =
                `${vacuna.vacuna} - ` +
                `Dosis ${vacuna.numero_dosis} - ` +
                `${fecha} (${vacuna.estado})`;

            selectVacuna.add(
                new Option(
                    texto,
                    String(vacuna.id_esquema)
                )
            );
        });

        selectVacuna.disabled =
            vacunas.length === 0;

        if (vacunas.length === 0) {
            selectVacuna.replaceChildren(
                new Option(
                    "No hay vacunas pendientes o próximas",
                    ""
                )
            );
        }

    } catch (error) {
        console.error(error);
        mostrarMensaje(error.message, "danger");
    }
}

// ==========================================
// ENVIAR PRUEBA
// ==========================================

async function enviarNotificacion(evento) {

    evento.preventDefault();

    const idNino = Number(
        document.getElementById("idNino").value
    );

    const idPadre = Number(
        document.getElementById("idPadre").value
    );

    const idEsquema = Number(
        document.getElementById("idEsquema").value
    );

    if (!idNino || !idPadre || !idEsquema) {
        mostrarMensaje(
            "Seleccione niño, responsable y vacuna",
            "warning"
        );
        return;
    }

    const relacionValida =
        relacionesNinosResponsables.some(
            item =>
                Number(item.id_nino) === idNino &&
                Number(item.id_padre) === idPadre
        );

    const vacunaValida =
        vacunasDelNino.some(
            item => Number(item.id_esquema) === idEsquema
        );

    if (!relacionValida || !vacunaValida) {
        mostrarMensaje(
            "La selección no corresponde al niño",
            "danger"
        );
        return;
    }

    if (!confirm("¿Enviar recordatorio de vacunación por WhatsApp?")) {
        return;
    }

    const boton =
        document.getElementById("btnEnviar");

    boton.disabled = true;
    boton.textContent = "Enviando...";

    try {
        const resultado = await consultarAPI(
            "/enviar-prueba",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    id_nino: idNino,
                    id_padre: idPadre,
                    id_esquema: idEsquema
                })
            }
        );

        mostrarMensaje(
            `Prueba aceptada por Meta. Registro: ` +
            resultado.id_notificacion
        );

        await cargarHistorial();

    } catch (error) {
        console.error(error);
        mostrarMensaje(error.message, "danger");

    } finally {
        boton.disabled = false;
        boton.textContent = "Enviar WhatsApp";
    }
}

// ==========================================
// GENERAR RECORDATORIOS
// ==========================================

async function generarRecordatorios() {

    const boton = document.getElementById(
        "btnGenerarRecordatorios"
    );

    if (!confirm(
        "¿Generar recordatorios para las vacunas " +
        "programadas dentro de 3 días? " +
        "Esta acción NO enviará mensajes."
    )) {
        return;
    }

    boton.disabled = true;
    boton.textContent = "Generando...";

    try {
        const resultado = await consultarAPI(
            "/recordatorios/generar",
            {
                method: "POST"
            }
        );

        mostrarMensaje(
            `Programación finalizada. ` +
            `Nuevos recordatorios: ${resultado.generados}`
        );

        await cargarRecordatorios();
        await cargarCalendario();

    } catch (error) {
        console.error(error);
        mostrarMensaje(error.message, "danger");

    } finally {
        boton.disabled = false;
        boton.textContent = "Generar recordatorios";
    }
}

// ==========================================
// CONSULTAR RECORDATORIOS
// ==========================================

async function cargarRecordatorios() {

    try {
        const datos = await consultarAPI(
            "/recordatorios"
        );

        if (!Array.isArray(datos)) {
            throw new Error(
                "Respuesta de recordatorios no válida"
            );
        }

        recordatorios = datos;

        actualizarIndicadoresRecordatorios();
        mostrarRecordatorios();

    } catch (error) {
        console.error(error);
        mostrarMensaje(error.message, "danger");
    }
}

// ==========================================
// INDICADORES RECORDATORIOS
// ==========================================

function actualizarIndicadoresRecordatorios() {

    const contar = estado =>
        recordatorios.filter(
            r => r.estado === estado
        ).length;

    document.getElementById(
        "totalPendientes"
    ).textContent = contar("pendiente_autorizacion");

    document.getElementById(
        "totalAutorizados"
    ).textContent = contar("autorizado");

    document.getElementById(
        "totalRecordatoriosAceptados"
    ).textContent = contar("aceptado");
}

// ==========================================
// FECHAS
// ==========================================

function formatearFecha(fecha) {

    if (!fecha) return "Sin registrar";

    const valor = new Date(fecha);

    if (Number.isNaN(valor.getTime())) {
        return "Fecha no válida";
    }

    return valor.toLocaleString("es-GT");
}

function formatearFechaCorta(fecha) {

    if (!fecha) return "-";

    return String(fecha).substring(0, 10);
}

// ==========================================
// ESTADOS
// ==========================================

function crearEstado(estado) {

    const span = document.createElement("span");

    const clases = {
        pendiente: "bg-warning text-dark",
        pendiente_autorizacion: "bg-warning text-dark",
        autorizado: "bg-info text-dark",
        procesando: "bg-info text-dark",
        aceptado: "bg-primary",
        enviado: "bg-primary",
        entregado: "bg-success",
        leido: "bg-success",
        fallido: "bg-danger",
        cancelado: "bg-secondary"
    };

    span.className =
        `badge ${clases[estado] || "bg-secondary"}`;

    span.textContent =
        String(estado || "Sin estado")
            .replaceAll("_", " ");

    return span;
}

// ==========================================
// MOSTRAR RECORDATORIOS
// ==========================================

function mostrarRecordatorios() {

    const tabla = document.getElementById(
        "tablaRecordatorios"
    );

    tabla.replaceChildren();

    if (recordatorios.length === 0) {

        const fila = document.createElement("tr");
        const celda = document.createElement("td");

        celda.colSpan = 9;
        celda.className = "text-center text-muted";
        celda.textContent =
            "No hay recordatorios programados";

        fila.appendChild(celda);
        tabla.appendChild(fila);
        return;
    }

    recordatorios.forEach(r => {

        const fila = document.createElement("tr");

        const agregarCelda = valor => {
            const celda = document.createElement("td");
            celda.textContent = valor ?? "";
            fila.appendChild(celda);
            return celda;
        };

        agregarCelda(r.id_recordatorio);

        agregarCelda([
            r.nombres_nino,
            r.apellidos_nino
        ].filter(Boolean).join(" "));

        agregarCelda([
            r.nombres_responsable,
            r.apellidos_responsable
        ].filter(Boolean).join(" "));

        agregarCelda(r.vacuna);
        agregarCelda(r.numero_dosis);

        agregarCelda(
            formatearFechaCorta(r.fecha_vacunacion)
        );

        agregarCelda(
            formatearFechaCorta(r.fecha_programada)
        );

        const celdaEstado =
            document.createElement("td");

        celdaEstado.appendChild(
            crearEstado(r.estado)
        );

        fila.appendChild(celdaEstado);

        // ACCIONES
        const celdaAcciones =
            document.createElement("td");

        const grupo = document.createElement("div");

        grupo.className = "d-flex flex-wrap gap-1";

        function agregarBoton(texto, accion, clase) {

            const boton = document.createElement("button");

            boton.type = "button";
            boton.className = `btn btn-sm ${clase}`;
            boton.textContent = texto;

            boton.dataset.accion = accion;
            boton.dataset.id = r.id_recordatorio;

            grupo.appendChild(boton);
        }

        if (r.estado === "pendiente_autorizacion") {

            agregarBoton(
                "Autorizar",
                "autorizar",
                "btn-success"
            );

            agregarBoton(
                "Cancelar",
                "cancelar",
                "btn-outline-danger"
            );
        }

        if (r.estado === "autorizado") {

            agregarBoton(
                "Enviar",
                "enviar",
                "btn-primary"
            );

            agregarBoton(
                "Cancelar",
                "cancelar",
                "btn-outline-danger"
            );
        }

        if (
            r.estado !== "pendiente_autorizacion" &&
            r.estado !== "autorizado"
        ) {
            const texto = document.createElement("span");
            texto.className = "text-muted small";
            texto.textContent = "Sin acciones";
            grupo.appendChild(texto);
        }

        celdaAcciones.appendChild(grupo);
        fila.appendChild(celdaAcciones);

        tabla.appendChild(fila);
    });
}

// ==========================================
// ACCIONES RECORDATORIOS
// ==========================================

async function manejarAccionRecordatorio(evento) {

    const boton = evento.target.closest(
        "button[data-accion][data-id]"
    );

    if (!boton) return;

    const id = Number(boton.dataset.id);
    const accion = boton.dataset.accion;

    if (!Number.isSafeInteger(id) || id <= 0) {
        return;
    }

    const mensajes = {
        autorizar: "¿Autorizar este recordatorio?",
        cancelar: "¿Cancelar este recordatorio?",
        enviar: "¿Enviar este recordatorio mediante WhatsApp?"
    };

    if (!mensajes[accion]) return;

    if (!confirm(mensajes[accion])) return;

    boton.disabled = true;

    try {
        let ruta;
        let metodo;

        if (accion === "autorizar") {
            ruta = `/recordatorios/${id}/autorizar`;
            metodo = "PATCH";

        } else if (accion === "cancelar") {
            ruta = `/recordatorios/${id}/cancelar`;
            metodo = "PATCH";

        } else {
            ruta = `/recordatorios/${id}/enviar`;
            metodo = "POST";
        }

        const resultado = await consultarAPI(
            ruta,
            { method: metodo }
        );

        mostrarMensaje(
            resultado.mensaje || "Operación completada"
        );

        await cargarRecordatorios();

        if (accion === "enviar") {
            await cargarHistorial();
        }

    } catch (error) {
        console.error(error);
        mostrarMensaje(error.message, "danger");

        await cargarRecordatorios();

    } finally {
        boton.disabled = false;
    }
}

// ==========================================
// CONSULTAR HISTORIAL WHATSAPP
// ==========================================

async function cargarHistorial() {

    try {
        const datos = await consultarAPI("/historial");

        historialNotificaciones =
            Array.isArray(datos) ? datos : [];

        actualizarIndicadores();
        mostrarHistorial();

    } catch (error) {
        console.error(error);
        mostrarMensaje(error.message, "danger");
    }
}

// ==========================================
// INDICADORES WHATSAPP
// ==========================================

function actualizarIndicadores() {

    document.getElementById(
        "totalNotificaciones"
    ).textContent = historialNotificaciones.length;

    document.getElementById(
        "totalAceptadas"
    ).textContent = historialNotificaciones.filter(
        n => n.estado === "aceptado"
    ).length;

    document.getElementById(
        "totalFallidas"
    ).textContent = historialNotificaciones.filter(
        n => n.estado === "fallido"
    ).length;
}

// ==========================================
// MOSTRAR HISTORIAL
// ==========================================

function mostrarHistorial() {

    const tabla = document.getElementById(
        "tablaNotificaciones"
    );

    const busqueda = document.getElementById(
        "buscarNotificacion"
    ).value.toLowerCase().trim();

    const estado = document.getElementById(
        "filtroEstado"
    ).value;

    const filtradas =
        historialNotificaciones.filter(n => {

            const texto = [
                n.nombres_nino,
                n.apellidos_nino,
                n.nombres_responsable,
                n.apellidos_responsable,
                n.vacuna
            ].filter(Boolean).join(" ").toLowerCase();

            return (
                texto.includes(busqueda) &&
                (!estado || n.estado === estado)
            );
        });

    tabla.replaceChildren();

    if (filtradas.length === 0) {

        const fila = document.createElement("tr");
        const celda = document.createElement("td");

        celda.colSpan = 9;
        celda.className = "text-center text-muted";
        celda.textContent =
            "No se encontraron notificaciones";

        fila.appendChild(celda);
        tabla.appendChild(fila);
        return;
    }

    filtradas.forEach(n => {

        const fila = document.createElement("tr");

        const agregarCelda = valor => {
            const celda = document.createElement("td");
            celda.textContent = valor ?? "";
            fila.appendChild(celda);
            return celda;
        };

        agregarCelda(n.id_notificacion);

        agregarCelda([
            n.nombres_nino,
            n.apellidos_nino
        ].filter(Boolean).join(" ") || "No asociado");

        agregarCelda([
            n.nombres_responsable,
            n.apellidos_responsable
        ].filter(Boolean).join(" "));

        agregarCelda(n.vacuna || "No asociada");

        agregarCelda(n.numero_dosis ?? "-");

        agregarCelda(n.tipo_notificacion);

        const celdaEstado =
            document.createElement("td");

        celdaEstado.appendChild(
            crearEstado(n.estado)
        );

        fila.appendChild(celdaEstado);

        agregarCelda(formatearFecha(n.fecha_envio));

        agregarCelda(
            n.id_mensaje_meta || "-"
        ).classList.add("text-break");

        tabla.appendChild(fila);
    });
}


// ==========================================
// CALENDARIO DE VACUNACIÓN
// ==========================================

async function cargarCalendario() {

    try {
        const datos = await consultarAPI(
            "/calendario"
        );

        if (!Array.isArray(datos)) {
            throw new Error(
                "Respuesta del calendario no válida"
            );
        }

        calendarioVacunacion = datos;

        actualizarIndicadoresCalendario();
        mostrarCalendario();

    } catch (error) {
        console.error(
            "ERROR CALENDARIO:",
            error
        );

        mostrarMensaje(
            error.message,
            "danger"
        );
    }
}

// ==========================================
// INDICADORES
// ==========================================

function actualizarIndicadoresCalendario() {

    const proximas = calendarioVacunacion.filter(
        item =>
            item.estado_calendario === "proxima_3_dias" ||
            item.estado_calendario === "hoy"
    );

    const conRecordatorio =
        calendarioVacunacion.filter(
            item => item.id_recordatorio !== null
                   && item.id_recordatorio !== undefined
        );

    document.getElementById(
        "totalCalendario"
    ).textContent = calendarioVacunacion.length;

    document.getElementById(
        "totalProximas"
    ).textContent = proximas.length;

    document.getElementById(
        "totalConRecordatorio"
    ).textContent = conRecordatorio.length;
}

// ==========================================
// ESTADO DEL CALENDARIO
// ==========================================

function crearEstadoCalendario(estado) {

    const span = document.createElement("span");

    const configuracion = {
        programada: {
            texto: "Programada",
            clase: "bg-secondary"
        },

        proxima_3_dias: {
            texto: "Próxima en 3 días",
            clase: "bg-warning text-dark"
        },

        hoy: {
            texto: "Corresponde hoy",
            clase: "bg-info text-dark"
        }
    };

    const datos = configuracion[estado] || {
        texto: estado || "Sin estado",
        clase: "bg-secondary"
    };

    span.className = `badge ${datos.clase}`;
    span.textContent = datos.texto;

    return span;
}

// ==========================================
// MOSTRAR CALENDARIO
// ==========================================

function mostrarCalendario() {

    const tabla = document.getElementById(
        "tablaCalendario"
    );

    const busqueda = document.getElementById(
        "buscarCalendario"
    ).value.toLowerCase().trim();

    const filtro = document.getElementById(
        "filtroCalendario"
    ).value;

    const filtrados = calendarioVacunacion.filter(
        item => {

            const texto = [
                item.nombres_nino,
                item.apellidos_nino,
                item.vacuna
            ].filter(Boolean)
             .join(" ")
             .toLowerCase();

            return (
                texto.includes(busqueda) &&
                (
                    !filtro ||
                    item.estado_calendario === filtro
                )
            );
        }
    );

    tabla.replaceChildren();

    if (filtrados.length === 0) {

        const fila = document.createElement("tr");
        const celda = document.createElement("td");

        celda.colSpan = 7;
        celda.className =
            "text-center text-muted";

        celda.textContent =
            "No se encontraron vacunas próximas";

        fila.appendChild(celda);
        tabla.appendChild(fila);

        return;
    }

    filtrados.forEach(item => {

        const fila = document.createElement("tr");

        function agregarCelda(valor) {
            const celda = document.createElement("td");
            celda.textContent = valor ?? "-";
            fila.appendChild(celda);
            return celda;
        }

        const nombreNino = [
            item.nombres_nino,
            item.apellidos_nino
        ].filter(Boolean).join(" ");

        agregarCelda(nombreNino);
        agregarCelda(item.vacuna);
        agregarCelda(item.numero_dosis);

        agregarCelda(
            item.fecha_vacunacion
        );

        const dias = Number(
            item.dias_restantes
        );

        agregarCelda(
            dias === 0
                ? "Hoy"
                : `${dias} días`
        );

        const celdaEstado =
            document.createElement("td");

        celdaEstado.appendChild(
            crearEstadoCalendario(
                item.estado_calendario
            )
        );

        fila.appendChild(celdaEstado);

        const celdaRecordatorio =
            document.createElement("td");

        if (item.id_recordatorio) {

            const estado = document.createElement("span");

            estado.className =
                "badge bg-primary";

            estado.textContent =
                String(
                    item.estado_recordatorio ||
                    "Registrado"
                ).replaceAll("_", " ");

            celdaRecordatorio.appendChild(estado);

        } else {

            celdaRecordatorio.textContent =
                "Sin generar";
        }

        fila.appendChild(celdaRecordatorio);

        tabla.appendChild(fila);
    });
}

// ==========================================
// RESPONSABLES PARA RECORDATORIO MANUAL
// ==========================================

function cargarResponsablesManuales() {
    const idNino = Number(
        document.getElementById("manualIdNino").value
    );

    const select = document.getElementById("manualIdPadre");

    select.replaceChildren(
        new Option("Seleccione un responsable", "")
    );

    select.disabled = true;

    if (!idNino) return;

    const responsables = relacionesNinosResponsables.filter(
        item =>
            Number(item.id_nino) === idNino &&
            item.responsable_principal === true
    );

    responsables.forEach(item => {
        const nombre = [
            item.nombres_responsable,
            item.apellidos_responsable
        ].filter(Boolean).join(" ");

        select.add(
            new Option(nombre + " (Principal)", String(item.id_padre))
        );
    });

    select.disabled = responsables.length === 0;

    if (responsables.length === 1) {
        select.value = String(responsables[0].id_padre);
    }
}

// ==========================================
// VACUNAS PARA RECORDATORIO MANUAL
// ==========================================

async function cargarVacunasManuales() {
    const idNino = Number(
        document.getElementById("manualIdNino").value
    );

    const select = document.getElementById("manualIdEsquema");

    select.replaceChildren(
        new Option("Seleccione una vacuna", "")
    );

    select.disabled = true;

    if (!idNino) return;

    try {
        const vacunas = await consultarAPI(
            `/vacunas-pendientes/${idNino}`
        );

        if (
            Number(document.getElementById("manualIdNino").value)
            !== idNino
        ) {
            return;
        }

        if (!Array.isArray(vacunas)) {
            throw new Error("No se pudieron cargar las vacunas");
        }

        vacunas.forEach(vacuna => {
            select.add(
                new Option(
                    `${vacuna.vacuna} - Dosis ${vacuna.numero_dosis}`,
                    String(vacuna.id_esquema)
                )
            );
        });

        select.disabled = vacunas.length === 0;

    } catch (error) {
        console.error(error);
        mostrarMensaje(error.message, "danger");
    }
}

// ==========================================
// CREAR RECORDATORIO MANUAL
// ==========================================

async function crearRecordatorioManual(evento) {
    evento.preventDefault();

    const idNino = Number(
        document.getElementById("manualIdNino").value
    );

    const idPadre = Number(
        document.getElementById("manualIdPadre").value
    );

    const idEsquema = Number(
        document.getElementById("manualIdEsquema").value
    );

    const fechaVacunacion =
        document.getElementById("manualFechaVacunacion").value;

    if (!idNino || !idPadre || !idEsquema || !fechaVacunacion) {
        mostrarMensaje("Complete todos los campos", "warning");
        return;
    }

    if (!confirm("¿Crear este recordatorio manual de prueba?")) {
        return;
    }

    const boton = document.getElementById(
        "btnGuardarRecordatorioManual"
    );

    boton.disabled = true;
    boton.textContent = "Guardando...";

    try {
        const resultado = await consultarAPI(
            "/recordatorios/manual",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    id_nino: idNino,
                    id_padre: idPadre,
                    id_esquema: idEsquema,
                    fecha_vacunacion: fechaVacunacion
                })
            }
        );

        mostrarMensaje(
            resultado.mensaje ||
            "Recordatorio manual creado correctamente"
        );

        document.getElementById(
            "formRecordatorioManual"
        ).reset();

        document.getElementById(
            "manualIdPadre"
        ).disabled = true;

        document.getElementById(
            "manualIdEsquema"
        ).disabled = true;

        await cargarRecordatorios();

    } catch (error) {
        console.error(error);
        mostrarMensaje(error.message, "danger");

    } finally {
        boton.disabled = false;
        boton.textContent = "Crear recordatorio manual";
    }
}

