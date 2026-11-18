
// ==========================================
// DASHBOARD SCCVI
// ==========================================

let graficoVacunacion = null;

// ==========================================
// CONSULTAR API
// ==========================================
async function consultarDashboard(ruta) {
    const respuesta = await fetch(ruta, {
        credentials: "same-origin",
        cache: "no-store"
    });

    if (respuesta.status === 401) {
        window.location.replace("/login");
        throw new Error("Debe iniciar sesión");
    }

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(
            datos.error || "Error al consultar el Dashboard"
        );
    }

    return datos;
}

// ==========================================
// ACTUALIZAR INDICADORES GENERALES
// ==========================================
function actualizarIndicadores(datos) {
    const indicadores = {
        totalNinos: datos.total_ninos,
        totalPadres: datos.total_padres,
        totalVacunas: datos.total_vacunas,
        totalCrecimiento: datos.total_crecimiento
    };

    Object.entries(indicadores).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);

        if (elemento) {
            elemento.textContent =
                Number(valor || 0).toLocaleString("es-GT");
        }
    });
}

// ==========================================
// ACTUALIZAR INDICADORES DE ALERTAS
// ==========================================
function actualizarIndicadoresAlertas(alertas) {

    const pendientes = alertas.filter(
        alerta =>
            alerta.estado_seguimiento === "pendiente"
    ).length;

    const proximas = alertas.filter(
        alerta =>
            alerta.estado_seguimiento === "proxima"
    ).length;

    const elementoPendientes = document.getElementById(
        "dashboardPendientes"
    );

    const elementoProximas = document.getElementById(
        "dashboardProximas"
    );

    if (elementoPendientes) {
        elementoPendientes.textContent =
            pendientes.toLocaleString("es-GT");
    }

    if (elementoProximas) {
        elementoProximas.textContent =
            proximas.toLocaleString("es-GT");
    }
}

// ==========================================
// GRÁFICO DE VACUNACIÓN
// ==========================================
function mostrarGraficoVacunacion(datos) {

    const canvas = document.getElementById(
        "graficoVacunacion"
    );

    if (!canvas) return;

    if (typeof Chart === "undefined") {
        throw new Error(
            "No se encontró la librería Chart.js"
        );
    }

    // Destruir gráfico anterior antes de actualizar.
    if (graficoVacunacion) {
        graficoVacunacion.destroy();
    }

    // Preparar etiquetas de meses.
    const etiquetas = datos.map(registro => {

        const [anio, mes] = registro.mes.split("-");

        const fecha = new Date(
            Number(anio),
            Number(mes) - 1,
            1
        );

        return fecha.toLocaleDateString("es-GT", {
            month: "short",
            year: "numeric"
        });
    });

    // Preparar cantidades de aplicaciones.
    const cantidades = datos.map(
        registro => Number(registro.total)
    );

    // Crear gráfico.
    graficoVacunacion = new Chart(canvas, {
        type: "bar",

        data: {
            labels: etiquetas,

            datasets: [{
                label: "Vacunas aplicadas",
                data: cantidades,

                backgroundColor:
                    "rgba(13, 110, 253, 0.65)",

                borderColor:
                    "rgba(13, 110, 253, 1)",

                borderWidth: 1,
                borderRadius: 6
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
                    display: true
                }
            }
        }
    });
}

// ==========================================
// MOSTRAR ERRORES
// ==========================================
function mostrarErrorDashboard(texto) {

    const mensaje = document.getElementById(
        "mensajeDashboard"
    );

    if (!mensaje) return;

    mensaje.textContent = texto;
    mensaje.classList.remove("d-none");
}

// ==========================================
// LIMPIAR MENSAJES DE ERROR
// ==========================================
function limpiarErrorDashboard() {

    const mensaje = document.getElementById(
        "mensajeDashboard"
    );

    if (!mensaje) return;

    mensaje.textContent = "";
    mensaje.classList.add("d-none");
}

// ==========================================
// CARGAR DASHBOARD COMPLETO
// ==========================================
async function cargarDashboard() {

    limpiarErrorDashboard();

    try {

        // ==================================
        // CONSULTAR DATOS DE POSTGRESQL
        // ==================================
        const [resumen, mensual, alertas] =
            await Promise.all([

                // Estadísticas generales.
                consultarDashboard(
                    "/api/dashboard/resumen"
                ),

                // Vacunas aplicadas por mes.
                consultarDashboard(
                    "/api/dashboard/vacunacion-mensual"
                ),

                // Alertas de vacunación.
                consultarDashboard(
                    "/api/alertas/vacunacion"
                )

            ]);

        // ==================================
        // ACTUALIZAR TARJETAS GENERALES
        // ==================================
        actualizarIndicadores(resumen);

        // ==================================
        // ACTUALIZAR ALERTAS
        // ==================================
        actualizarIndicadoresAlertas(alertas);

        // ==================================
        // ACTUALIZAR GRÁFICO
        // ==================================
        mostrarGraficoVacunacion(mensual);

    } catch (error) {

        console.error(
            "ERROR DASHBOARD:",
            error
        );

        mostrarErrorDashboard(error.message);
    }
}

// ==========================================
// PERMITIR ACTUALIZACIÓN DESDE INDEX.JS
// ==========================================
window.cargarDashboard = cargarDashboard;
