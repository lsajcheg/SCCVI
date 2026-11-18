
"use strict";

// ==========================================
// ELEMENTOS
// ==========================================
const formFiltros = document.getElementById("formFiltros");
const filtroComunidad = document.getElementById("filtroComunidad");
const fechaInicio = document.getElementById("fechaInicio");
const fechaFin = document.getElementById("fechaFin");
const limpiarFiltros = document.getElementById("limpiarFiltros");
const tipoReporte = document.getElementById("tipoReporte");
const encabezadoReporte = document.getElementById("encabezadoReporte");
const tablaReporte = document.getElementById("tablaReporte");
const mensajeReportes = document.getElementById("mensajeReportes");

let graficoActual = null;
let numeroConsulta = 0;

// ==========================================
// CONSULTAR API
// ==========================================
async function consultarAPI(ruta) {
    const respuesta = await fetch(ruta, {
        credentials: "same-origin",
        cache: "no-store"
    });

    if (respuesta.status === 401) {
        window.top.location.replace("/login");
        throw new Error("Debe iniciar sesión");
    }

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(
            datos.error || "Error al consultar el servidor"
        );
    }

    return datos;
}

// ==========================================
// MENSAJES
// ==========================================
function mostrarMensaje(texto, tipo = "danger") {
    mensajeReportes.textContent = texto;
    mensajeReportes.className = `alert alert-${tipo}`;
}

function ocultarMensaje() {
    mensajeReportes.className = "alert d-none";
    mensajeReportes.textContent = "";
}

// ==========================================
// FILTROS
// ==========================================
function obtenerParametros() {
    const parametros = new URLSearchParams();

    if (filtroComunidad.value) {
        parametros.set("id_comunidad", filtroComunidad.value);
    }

    if (fechaInicio.value) {
        parametros.set("fecha_inicio", fechaInicio.value);
    }

    if (fechaFin.value) {
        parametros.set("fecha_fin", fechaFin.value);
    }

    return parametros.toString();
}

function construirRuta(recurso) {
    const parametros = obtenerParametros();

    return `/api/reportes/${recurso}` +
        (parametros ? `?${parametros}` : "");
}

// ==========================================
// COMUNIDADES
// ==========================================
async function cargarComunidades() {
    const comunidades = await consultarAPI(
        "/api/reportes/comunidades"
    );

    filtroComunidad.replaceChildren();

    filtroComunidad.add(
        new Option("Todas las comunidades", "")
    );

    comunidades.forEach(comunidad => {
        filtroComunidad.add(
            new Option(
                comunidad.nombre,
                comunidad.id_comunidad
            )
        );
    });
}

// ==========================================
// INDICADORES
// ==========================================
function mostrarIndicadores(datos) {
    document.getElementById("totalNinos").textContent =
        datos.total_ninos ?? 0;

    document.getElementById("totalDosis").textContent =
        datos.dosis_aplicadas ?? 0;

    document.getElementById("totalAlertas").textContent =
        datos.alertas_pendientes ?? 0;

    document.getElementById("totalComunidades").textContent =
        datos.total_comunidades ?? 0;
}

// ==========================================
// CONFIGURACIÓN DE REPORTES
// ==========================================
const configuraciones = {
    ninos: {
        columnas: [
            ["comunidad", "Comunidad"],
            ["total_ninos", "Total de niños"],
            ["masculinos", "Masculino"],
            ["femeninos", "Femenino"]
        ],
        etiqueta: "comunidad",
        valor: "total_ninos",
        titulo: "Niños por comunidad"
    },

    vacunacion: {
        columnas: [
            ["vacuna", "Vacuna"],
            ["dosis_aplicadas", "Dosis aplicadas"]
        ],
        etiqueta: "vacuna",
        valor: "dosis_aplicadas",
        titulo: "Dosis aplicadas por vacuna"
    },

    alertas: {
        columnas: [
            ["estado", "Estado"],
            ["total", "Cantidad"]
        ],
        etiqueta: "estado",
        valor: "total",
        titulo: "Alertas por estado"
    },
    
cumplimiento_vacunacion: {
    columnas: [
        ["concepto", "Indicador"],
        ["cantidad", "Cantidad"]
    ],
    etiqueta: "concepto",
    valor: "cantidad",
    titulo: "Cumplimiento del esquema de vacunación"
}

};

const nombresEstados = {
    pendiente: "Pendiente",
    en_seguimiento: "En seguimiento",
    atendida: "Atendida",
    cerrada: "Cerrada"
};



// ==========================================
// PREPARAR REPORTE DE CUMPLIMIENTO
// ==========================================
function prepararCumplimiento(datos) {
    const porcentaje = Number(
        datos.porcentaje_cumplimiento
    ) || 0;

    const resumen = document.getElementById(
        "resumenCumplimiento"
    );

    document.getElementById(
        "porcentajeCumplimiento"
    ).textContent = `${porcentaje.toFixed(2)}%`;

    const barra = document.getElementById(
        "barraCumplimiento"
    );

    barra.style.width = `${Math.min(100, Math.max(0, porcentaje))}%`;
    barra.setAttribute("aria-valuenow", porcentaje);

    document.getElementById(
        "detalleCumplimiento"
    ).textContent =
        `${datos.dosis_aplicadas} dosis aplicadas de ` +
        `${datos.dosis_esperadas} dosis esperadas.`;

    resumen.hidden = false;

    return [
        {
            concepto: "Dosis aplicadas",
            cantidad: datos.dosis_aplicadas
        },
        {
            concepto: "Dosis pendientes",
            cantidad: datos.dosis_pendientes
        },
        {
            concepto: "Próximas dosis",
            cantidad: datos.proximas_dosis
        },
        {
            concepto: "Dosis esperadas",
            cantidad: datos.dosis_esperadas
        }
    ];
}


// ==========================================
// TABLA
// ==========================================
function mostrarTabla(datos, configuracion) {
    encabezadoReporte.replaceChildren();
    tablaReporte.replaceChildren();

    const filaEncabezado = document.createElement("tr");

    configuracion.columnas.forEach(([, titulo]) => {
        const th = document.createElement("th");
        th.textContent = titulo;
        filaEncabezado.appendChild(th);
    });

    encabezadoReporte.appendChild(filaEncabezado);

    if (!datos.length) {
        const fila = document.createElement("tr");
        const celda = document.createElement("td");

        celda.colSpan = configuracion.columnas.length;
        celda.className = "text-center text-muted py-4";
        celda.textContent = "No existen registros para los filtros seleccionados.";

        fila.appendChild(celda);
        tablaReporte.appendChild(fila);
        return;
    }

    datos.forEach(registro => {
        const fila = document.createElement("tr");

        configuracion.columnas.forEach(([campo]) => {
            const celda = document.createElement("td");

            let valor = registro[campo] ?? "-";

            if (campo === "estado") {
                valor = nombresEstados[valor] || valor;
            }

            celda.textContent = valor;
            fila.appendChild(celda);
        });

        tablaReporte.appendChild(fila);
    });
}

// ==========================================
// GRÁFICO
// ==========================================
function mostrarGrafico(datos, configuracion) {
    if (graficoActual) {
        graficoActual.destroy();
        graficoActual = null;
    }

    const canvas = document.getElementById("graficoReporte");

    if (typeof Chart === "undefined") {
        throw new Error("No se pudo cargar Chart.js");
    }

    const etiquetas = datos.map(registro => {
        const valor = registro[configuracion.etiqueta];

        if (configuracion.etiqueta === "estado") {
            return nombresEstados[valor] || valor;
        }

        return valor;
    });

    const valores = datos.map(
        registro => Number(registro[configuracion.valor]) || 0
    );

    graficoActual = new Chart(canvas, {
        type: "bar",
        data: {
            labels: etiquetas,
            datasets: [{
                label: configuracion.titulo,
                data: valores,
                backgroundColor: "rgba(13, 110, 253, 0.65)",
                borderColor: "rgb(13, 110, 253)",
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// ==========================================
// CARGAR REPORTES
// ==========================================
async function cargarReportes() {
    const consultaActual = ++numeroConsulta;
    ocultarMensaje();

    if (
        fechaInicio.value &&
        fechaFin.value &&
        fechaInicio.value > fechaFin.value
    ) {
        mostrarMensaje(
            "La fecha inicial no puede superar la fecha final."
        );
        return;
    }

   const tipo = tipoReporte.value;

const esCumplimiento =
    tipo === "cumplimiento-vacunacion";

const configuracion = esCumplimiento
    ? configuraciones.cumplimiento_vacunacion
    : configuraciones[tipo];

    try {
        const [indicadores, datos] = await Promise.all([
            consultarAPI(construirRuta("indicadores")),
            consultarAPI(construirRuta(tipo))
        ]);

        // Evitar mostrar respuestas de filtros anteriores.
        if (consultaActual !== numeroConsulta) return;

       
mostrarIndicadores(indicadores);

const resumen = document.getElementById(
    "resumenCumplimiento"
);

resumen.hidden = true;

const registros = esCumplimiento
    ? prepararCumplimiento(datos)
    : datos;

mostrarTabla(registros, configuracion);
mostrarGrafico(registros, configuracion);


    } catch (error) {
        if (consultaActual !== numeroConsulta) return;

        console.error("ERROR REPORTES:", error);
        mostrarMensaje(error.message);
    }
}

// ==========================================
// EVENTOS
// ==========================================
formFiltros.addEventListener("submit", evento => {
    evento.preventDefault();
    cargarReportes();
});

tipoReporte.addEventListener("change", cargarReportes);

limpiarFiltros.addEventListener("click", () => {
    formFiltros.reset();
    tipoReporte.value = "ninos";
    cargarReportes();
});

// ==========================================
// INICIALIZAR
// ==========================================
async function iniciarReportes() {
    try {
        await cargarComunidades();
        await cargarReportes();
    } catch (error) {
        console.error("ERROR INICIALIZAR REPORTES:", error);
        mostrarMensaje(error.message);
    }
}


// ==========================================
// EXPORTACIÓN DE REPORTES
// ==========================================
const btnExportarPDF =
    document.getElementById("btnExportarPDF");

const btnExportarExcel =
    document.getElementById("btnExportarExcel");

async function configurarExportaciones() {
    try {
        const sesion = await consultarAPI("/api/auth/sesion");

        const rolesPermitidos = [
            "administrador",
            "medico",
            "enfermero"
        ];

        const autorizado = rolesPermitidos.includes(
            sesion.usuario?.rol
        );

        document.getElementById(
            "accionesExportacion"
        ).hidden = !autorizado;

    } catch (error) {
        document.getElementById(
            "accionesExportacion"
        ).hidden = true;

        console.error("ERROR PERMISOS EXPORTACIÓN:", error);
    }
}

async function descargarReporte(formato) {
    const tipo = tipoReporte.value;
    const parametros = obtenerParametros();

    if (
        fechaInicio.value &&
        fechaFin.value &&
        fechaInicio.value > fechaFin.value
    ) {
        mostrarMensaje(
            "La fecha inicial no puede superar la fecha final."
        );
        return;
    }

    const ruta = `/api/reportes/exportar/${formato}/${tipo}` +
        (parametros ? `?${parametros}` : "");

    const boton = formato === "pdf"
        ? btnExportarPDF
        : btnExportarExcel;

    boton.disabled = true;

    try {
        const respuesta = await fetch(ruta, {
            credentials: "same-origin"
        });

        if (!respuesta.ok) {
            const error = await respuesta.json();

            throw new Error(
                error.error || "No se pudo exportar el reporte"
            );
        }

        const archivo = await respuesta.blob();
        const url = URL.createObjectURL(archivo);

        const enlace = document.createElement("a");
        enlace.href = url;

        enlace.download =
            `reporte-sccvi-${tipo}.${formato === "pdf" ? "pdf" : "xlsx"}`;

        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

    } catch (error) {
        mostrarMensaje(error.message);
    } finally {
        boton.disabled = false;
    }
}

btnExportarPDF.addEventListener("click", () => {
    descargarReporte("pdf");
});

btnExportarExcel.addEventListener("click", () => {
    descargarReporte("excel");
});

configurarExportaciones();


iniciarReportes();
