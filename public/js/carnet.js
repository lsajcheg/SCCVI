
document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // ELEMENTOS PRINCIPALES
    // ==========================================

    
const contenedorQR =
    document.getElementById("contenedorQRCarnet");

const imagenQR =
    document.getElementById("imagenQRCarnet");

const btnDescargarQR =
    document.getElementById("btnDescargarQR");

function ocultarQR() {
    imagenQR.removeAttribute("src");
    contenedorQR.classList.add("d-none");
}

async function cargarQR(idNino, version) {

    ocultarQR();

    const datos = await consultarAPI(
        `/api/carnet/acceso/${encodeURIComponent(idNino)}/qr`
    );

    if (
        version !== versionConsulta ||
        seleccionarNino.value !== String(idNino)
    ) {
        return;
    }

    imagenQR.src = datos.qr;
    contenedorQR.classList.remove("d-none");
}

btnDescargarQR.addEventListener("click", () => {

    if (!imagenQR.src) return;

    const enlace = document.createElement("a");

    enlace.href = imagenQR.src;
    enlace.download =
        `QR-Carnet-${seleccionarNino.value}.png`;

    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
});


    const seleccionarNino =
        document.getElementById("seleccionarNino");

    const contenidoCarnet =
        document.getElementById("contenidoCarnet");

    const mensajeCarnet =
        document.getElementById("mensajeCarnet");

    // ==========================================
    // ELEMENTOS DE GESTIÓN DE ACCESO
    // ==========================================

    const gestionAcceso =
        document.getElementById("gestionAccesoCarnet");

    const estadoAcceso =
        document.getElementById("estadoAccesoCarnet");

    const mensajeAcceso =
        document.getElementById("mensajeAccesoCarnet");

    const resultadoPIN =
        document.getElementById("resultadoPINCarnet");

    const pinGenerado =
        document.getElementById("pinGeneradoCarnet");

    const btnActivar =
        document.getElementById("btnActivarCarnet");

    const btnRestablecer =
        document.getElementById("btnRestablecerPIN");

    const btnRevocar =
        document.getElementById("btnRevocarCarnet");

    let puedeGestionarAcceso = false;
    let accesoOcupado = false;
    let estadoActual = "sin_activar";

    // Evita mostrar datos de una selección anterior
    // si una consulta termina después de otra.
    let versionConsulta = 0;

    // ==========================================
    // MENSAJES GENERALES
    // ==========================================

    function mostrarError(mensaje) {
        mensajeCarnet.textContent = mensaje;
        mensajeCarnet.classList.remove("d-none");
    }

    function limpiarError() {
        mensajeCarnet.textContent = "";
        mensajeCarnet.classList.add("d-none");
    }

    // ==========================================
    // FORMATO DE FECHAS
    // ==========================================

    function formatoFecha(fecha) {
        if (!fecha) {
            return "No registrada";
        }

        const valor = String(fecha).slice(0, 10);
        const partes = valor.split("-");

        if (partes.length !== 3) {
            return "No registrada";
        }

        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    function establecerTexto(id, valor) {
        const elemento = document.getElementById(id);

        if (elemento) {
            elemento.textContent = valor ?? "--";
        }
    }

    // ==========================================
    // CONSULTAS API
    // ==========================================

    async function consultarAPI(url) {

        const respuesta = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store"
        });

        if (respuesta.status === 401) {
            window.top.location.href = "/login";

            throw new Error(
                "La sesión ha expirado"
            );
        }

        if (!respuesta.ok) {
            const datos = await respuesta.json()
                .catch(() => ({}));

            throw new Error(
                datos.error ||
                "Error al consultar información"
            );
        }

        return respuesta.json();
    }

    // ==========================================
    // GESTIÓN DEL PIN
    // ==========================================

    function ocultarPIN() {
        pinGenerado.textContent = "";
        resultadoPIN.classList.add("d-none");
    }

    function mostrarPIN(pin) {
        pinGenerado.textContent = pin;
        resultadoPIN.classList.remove("d-none");
    }

    // ==========================================
    // MENSAJES DE ACCESO
    // ==========================================

    function limpiarMensajeAcceso() {
        mensajeAcceso.textContent = "";
        mensajeAcceso.className = "alert d-none";
    }

    function mostrarMensajeAcceso(
        texto,
        error = false
    ) {
        mensajeAcceso.textContent = texto;

        mensajeAcceso.className =
            `alert ${
                error
                    ? "alert-danger"
                    : "alert-success"
            } mt-3`;
    }

    // ==========================================
    // ESTADO DEL ACCESO
    // ==========================================

    function actualizarBotones() {

        btnActivar.disabled =
            accesoOcupado ||
            estadoActual === "activo";

        btnRestablecer.disabled =
            accesoOcupado ||
            estadoActual !== "activo";

        btnRevocar.disabled =
            accesoOcupado ||
            estadoActual !== "activo";
    }

    function mostrarEstadoAcceso(estado) {

        estadoActual = estado;

        const etiquetas = {
            activo: [
                "Activo",
                "bg-success"
            ],
            revocado: [
                "Revocado",
                "bg-danger"
            ],
            sin_activar: [
                "Sin activar",
                "bg-secondary"
            ]
        };

        const [texto, clase] =
            etiquetas[estado] ||
            etiquetas.sin_activar;

        estadoAcceso.className =
            `badge ${clase} ms-2`;

        estadoAcceso.textContent = texto;

        actualizarBotones();
    }

    async function consultarEstadoAcceso(
        idNino,
        version = versionConsulta
    ) {

        if (!puedeGestionarAcceso || !idNino) {
            return;
        }

        const respuesta = await consultarAPI(
            `/api/carnet/acceso/${
                encodeURIComponent(idNino)
            }`
        );

        if (
            version !== versionConsulta ||
            seleccionarNino.value !== String(idNino)
        ) {
            return;
        }

        const estado =
            respuesta.acceso?.estado ||
            "sin_activar";

        mostrarEstadoAcceso(estado);

        if (estado === "activo") {
    try {
        await cargarQR(idNino, version);
    } catch (error) {
        ocultarQR();
        mostrarMensajeAcceso(
            "El acceso está activo, pero no se pudo cargar el QR.",
            true
        );
    }
} else {
    ocultarQR();
}
    }

    // ==========================================
    // ACCIONES ADMINISTRATIVAS
    // ==========================================

    async function ejecutarAccionAcceso(accion) {

        const idNino = seleccionarNino.value;

        if (
            !idNino ||
            accesoOcupado ||
            !puedeGestionarAcceso
        ) {
            return;
        }

        const mensajes = {
            activar:
                "¿Confirmas que verificaste la identidad del responsable y deseas activar el acceso?",
            restablecer:
                "¿Deseas invalidar el PIN anterior y generar uno nuevo?",
            revocar:
                "¿Deseas revocar el acceso digital de este niño?"
        };

        if (!mensajes[accion]) {
            return;
        }

        if (!window.confirm(mensajes[accion])) {
            return;
        }

        const version = versionConsulta;

        try {

            accesoOcupado = true;

            ocultarPIN();
            limpiarMensajeAcceso();

            actualizarBotones();

            const respuesta = await fetch(
                `/api/carnet/acceso/${
                    encodeURIComponent(idNino)
                }/${accion}`,
                {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: {
                        "Content-Type":
                            "application/json"
                    }
                }
            );

            if (respuesta.status === 401) {
                window.top.location.href = "/login";

                throw new Error(
                    "La sesión ha expirado"
                );
            }

            const datos = await respuesta.json()
                .catch(() => ({}));

            if (!respuesta.ok) {
                throw new Error(
                    datos.error ||
                    "No se pudo completar la operación"
                );
            }

            // No mostrar información de otro niño
            if (
                version !== versionConsulta ||
                seleccionarNino.value !== idNino
            ) {
                return;
            }

            if (datos.pin) {
                mostrarPIN(datos.pin);
            }

            mostrarMensajeAcceso(
                datos.mensaje ||
                "Operación realizada correctamente"
            );

        } catch (error) {

            if (
                version === versionConsulta &&
                seleccionarNino.value === idNino
            ) {
                mostrarMensajeAcceso(
                    error.message,
                    true
                );
            }

        } finally {

            accesoOcupado = false;

            if (
                version === versionConsulta &&
                seleccionarNino.value === idNino
            ) {
                try {
                    await consultarEstadoAcceso(
                        idNino,
                        version
                    );
                } catch (error) {

                    mostrarMensajeAcceso(
                        "No se pudo actualizar el estado del acceso.",
                        true
                    );

                    // Evitar nuevas operaciones
                    // mientras el estado sea desconocido.
                    accesoOcupado = true;
                    actualizarBotones();
                    accesoOcupado = false;
                }
            }
        }
    }

    // ==========================================
    // BOTONES DE GESTIÓN
    // ==========================================

    btnActivar.addEventListener(
        "click",
        () => ejecutarAccionAcceso("activar")
    );

    btnRestablecer.addEventListener(
        "click",
        () => ejecutarAccionAcceso("restablecer")
    );

    btnRevocar.addEventListener(
        "click",
        () => ejecutarAccionAcceso("revocar")
    );

    // ==========================================
    // PERMISOS DEL USUARIO
    // ==========================================

    async function configurarGestionAcceso() {

        try {

            const sesion = await consultarAPI(
                "/api/auth/sesion"
            );

            const rol = sesion.usuario?.rol;

            puedeGestionarAcceso = [
                "administrador",
                "medico",
                "enfermero"
            ].includes(rol);

            gestionAcceso.classList.toggle(
                "d-none",
                !puedeGestionarAcceso
            );

        } catch (error) {

            puedeGestionarAcceso = false;

            gestionAcceso.classList.add(
                "d-none"
            );
        }
    }

    // ==========================================
    // CARGAR NIÑOS
    // ==========================================

    async function cargarNinos() {

        try {

            limpiarError();

            const ninos = await consultarAPI(
                "/api/ninos"
            );

            seleccionarNino.innerHTML = "";

            const opcionInicial =
                document.createElement("option");

            opcionInicial.value = "";

            opcionInicial.textContent =
                "Seleccione un niño";

            seleccionarNino.appendChild(
                opcionInicial
            );

            ninos.forEach(nino => {

                const opcion =
                    document.createElement("option");

                opcion.value = nino.id_nino;

                opcion.textContent =
                    `${nino.nombres} ${nino.apellidos}`;

                seleccionarNino.appendChild(
                    opcion
                );
            });

        } catch (error) {

            mostrarError(error.message);
        }
    }

    // ==========================================
    // CARGAR CARNET DIGITAL
    // ==========================================

    async function cargarCarnet(idNino) {

        const version = ++versionConsulta;

        contenidoCarnet.classList.add(
            "d-none"
        );

        limpiarError();
        limpiarMensajeAcceso();
        ocultarPIN();
        ocultarQR();

        mostrarEstadoAcceso("sin_activar");

        if (!idNino) {
            return;
        }

        try {

            const datos = await consultarAPI(
                `/api/carnet/${
                    encodeURIComponent(idNino)
                }`
            );

            if (version !== versionConsulta) {
                return;
            }

            const nino = datos.nino;

            const responsable =
                datos.responsable;

            const vacunas =
                datos.vacunacion || [];

            const crecimiento = datos.crecimiento || [];

            // DATOS DEL NIÑO

            establecerTexto(
                "carnetNombre",
                `${nino.nombres} ${nino.apellidos}`
            );

            establecerTexto(
                "carnetNacimiento",
                formatoFecha(
                    nino.fecha_nacimiento
                )
            );

            establecerTexto(
                "carnetSexo",
                nino.sexo === "M"
                    ? "Masculino"
                    : "Femenino"
            );

            establecerTexto(
                "carnetComunidad",
                nino.comunidad
            );

            establecerTexto(
                "carnetResponsable",
                responsable
                    ? `${responsable.nombres} ${
                        responsable.apellidos
                    }`
                    : "No registrado"
            );

            // RESUMEN DE VACUNACIÓN

            const aplicadas = vacunas.filter(
                v => v.estado === "aplicada"
            ).length;

            const pendientes = vacunas.filter(
                v => v.estado === "pendiente"
            ).length;

            const programadas = vacunas.filter(
                v => v.estado === "programada"
            ).length;

            establecerTexto(
                "carnetAplicadas",
                aplicadas
            );

            establecerTexto(
                "carnetPendientes",
                pendientes
            );

            establecerTexto(
                "carnetProgramadas",
                programadas
            );

            // TABLA DE VACUNACIÓN

            const tabla =
                document.getElementById(
                    "tablaCarnet"
                );

            tabla.innerHTML = "";

            vacunas.forEach(vacuna => {

                const fila =
                    document.createElement("tr");

                const columnas = [
                    vacuna.vacuna,
                    vacuna.numero_dosis,
                    formatoFecha(
                        vacuna.fecha_recomendada
                    ),
                    formatoFecha(
                        vacuna.fecha_aplicacion
                    )
                ];

                columnas.forEach(valor => {

                    const celda =
                        document.createElement("td");

                    celda.textContent = valor;

                    fila.appendChild(celda);
                });

                const celdaEstado =
                    document.createElement("td");

                const etiqueta =
                    document.createElement("span");

                etiqueta.classList.add("badge");

                const estados = {
                    aplicada: [
                        "Aplicada",
                        "bg-success"
                    ],
                    pendiente: [
                        "Pendiente",
                        "bg-warning"
                    ],
                    programada: [
                        "Programada",
                        "bg-primary"
                    ]
                };

                const estado =
                    estados[vacuna.estado] ||
                    [
                        "Sin definir",
                        "bg-secondary"
                    ];

                etiqueta.textContent =
                    estado[0];

                etiqueta.classList.add(
                    estado[1]
                );

                celdaEstado.appendChild(
                    etiqueta
                );

                fila.appendChild(
                    celdaEstado
                );

                tabla.appendChild(fila);
            });

            
// ==========================================
// MOSTRAR CONTROLES DE CRECIMIENTO
// ==========================================

const tablaCrecimiento =
    document.getElementById("tablaCrecimientoCarnet");

tablaCrecimiento.innerHTML = "";

if (crecimiento.length === 0) {

    const fila = document.createElement("tr");
    const celda = document.createElement("td");

    celda.colSpan = 4;
    celda.className = "text-center text-muted";
    celda.textContent =
        "El niño no tiene controles de crecimiento registrados.";

    fila.appendChild(celda);
    tablaCrecimiento.appendChild(fila);

} else {

    crecimiento.forEach(registro => {

        const fila = document.createElement("tr");

        const columnas = [
            formatoFecha(registro.fecha_medicion),
            registro.peso_kg,
            registro.talla_cm,
            registro.observaciones || "Sin observaciones"
        ];

        columnas.forEach(valor => {

            const celda = document.createElement("td");

            celda.textContent = valor;

            fila.appendChild(celda);
        });

        tablaCrecimiento.appendChild(fila);
    });
}


            contenidoCarnet.classList.remove(
                "d-none"
            );

            // ESTADO ADMINISTRATIVO DEL ACCESO

            if (puedeGestionarAcceso) {

                try {

                    await consultarEstadoAcceso(
                        idNino,
                        version
                    );

                } catch (error) {

                    if (version === versionConsulta) {

                        mostrarMensajeAcceso(
                            "No se pudo consultar el estado del acceso.",
                            true
                        );

                        // Deshabilitar acciones
                        // si falla la consulta.
                        btnActivar.disabled = true;
                        btnRestablecer.disabled = true;
                        btnRevocar.disabled = true;
                    }
                }
            }

        } catch (error) {

            if (version === versionConsulta) {
                mostrarError(error.message);
            }
        }
    }

    // ==========================================
    // CAMBIO DE NIÑO
    // ==========================================

    seleccionarNino.addEventListener(
        "change",
        () => {

            ocultarPIN();
            limpiarMensajeAcceso();

            cargarCarnet(
                seleccionarNino.value
            );
        }
    );

    // ==========================================
    // LIMPIAR PIN AL SALIR
    // ==========================================

    window.addEventListener(
        "pagehide",
        () => {
            ocultarPIN();
        }
    );

    // ==========================================
    // INICIALIZACIÓN
    // ==========================================

    async function iniciarCarnet() {

        await configurarGestionAcceso();

        await cargarNinos();
    }

    iniciarCarnet();

});
